/* src/tools/enrich/execute_policy.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { createProgressTracker, notificationManager } from "../../utils/notifications.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const executePolicyValidator = z.object({
  name: z.string().min(1, "Policy name cannot be empty"),
  masterTimeout: z.string().optional(),
  waitForCompletion: booleanField().optional(),
});

type ExecutePolicyParams = z.infer<typeof executePolicyValidator>;

// MCP error handling
function createExecutePolicyMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "policy_not_found" | "execution_failed" | "timeout";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    policy_not_found: ErrorCode.InvalidParams,
    execution_failed: ErrorCode.InternalError,
    timeout: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_enrich_execute_policy] ${message}`, context.details);
}

// Tool implementation
export const registerEnrichExecutePolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const executePolicyHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = executePolicyValidator.parse(args);
      const { name, masterTimeout, waitForCompletion } = params;

      // Create progress tracker for enrich policy execution
      const tracker = await createProgressTracker(
        "enrich_execute_policy",
        100, // percentage-based for policy execution
        `Executing enrich policy: ${name}`
      );

      logger.debug("Executing enrich policy", { name, masterTimeout, waitForCompletion });

      // Send initial notification with policy execution details
      await notificationManager.sendInfo(
        `Starting enrich policy execution: ${name}`,
        {
          operation_type: "enrich_execute_policy",
          policy_name: name,
          wait_for_completion: waitForCompletion,
          master_timeout: masterTimeout,
          execution_mode: waitForCompletion ? "synchronous" : "asynchronous",
        }
      );

      await tracker.updateProgress(10, "Initiating enrich policy execution");

      // Warn about potentially long-running operation
      if (waitForCompletion) {
        await notificationManager.sendWarning(
          `Policy execution in synchronous mode - this may take several minutes`,
          {
            operation_type: "enrich_execute_policy",
            policy_name: name,
            warning: "Synchronous execution blocks until the enrich index is fully built",
            recommendation: "Consider using asynchronous mode for large datasets",
          }
        );
      }

      await tracker.updateProgress(25, "Submitting policy execution request");

      const result = await esClient.enrich.executePolicy({
        name,
        master_timeout: masterTimeout,
        wait_for_completion: waitForCompletion,
      });

      const duration = performance.now() - perfStart;
      
      // Handle different response types based on wait_for_completion
      if (waitForCompletion === false && result.task) {
        // Asynchronous mode - return task ID
        await tracker.complete(
          { task: result.task },
          `Enrich policy execution task created: ${result.task}`
        );
        
        await notificationManager.sendInfo(
          `Enrich policy execution started asynchronously: ${result.task}`,
          {
            operation_type: "enrich_execute_policy",
            policy_name: name,
            mode: "asynchronous",
            task_id: result.task,
            note: "Use task management API to monitor execution progress",
            monitor_command: `elasticsearch_tasks_get_task with taskId: "${result.task}"`,
          }
        );
      } else {
        // Synchronous mode or completion
        await tracker.updateProgress(75, "Processing policy execution results");

        if (duration > 30000) {
          // Execute operations can take longer
          logger.warn("Slow execute enrich policy operation", { duration });
        }

        const executionSummary = {
          policy_name: name,
          duration_ms: duration,
          execution_time_seconds: Math.round(duration / 1000),
          mode: "synchronous",
          status: "completed",
        };

        await tracker.complete(
          executionSummary,
          `Enrich policy execution completed: ${name} in ${Math.round(duration)}ms`
        );

        if (duration > 60000) {
          await notificationManager.sendWarning(
            `Long execution time: ${Math.round(duration / 1000)}s for policy ${name}`,
            {
              operation_type: "enrich_execute_policy",
              ...executionSummary,
              performance_warning: true,
              recommendation: "Consider optimizing source data size or using asynchronous execution",
            }
          );
        } else {
          await notificationManager.sendInfo(
            `Enrich policy execution completed successfully: ${name}`,
            {
              operation_type: "enrich_execute_policy",
              ...executionSummary,
              performance_note: duration > 10000 ? "Standard execution time" : "Fast execution",
            }
          );
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      await tracker.fail(
        error instanceof Error ? error : new Error(String(error)),
        "Enrich policy execution failed"
      );
      
      await notificationManager.sendError(
        "Enrich policy execution failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          operation_type: "enrich_execute_policy",
          policy_name: params?.name,
          duration_ms: performance.now() - perfStart,
          failure_context: error instanceof Error && error.message.includes("not_found") ? 
            "Policy not found - ensure the enrich policy exists" : 
            "Execution failed - check cluster resources and source data",
        }
      );

      // Error handling
      if (error instanceof z.ZodError) {
        throw createExecutePolicyMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("timeout") || error.message.includes("timed_out")) {
          throw createExecutePolicyMcpError(`Operation timed out: ${error.message}`, {
            type: "timeout",
            details: { duration: performance.now() - perfStart },
          });
        }

        if (error.message.includes("not_found") || error.message.includes("resource_not_found_exception")) {
          throw createExecutePolicyMcpError(`Enrich policy not found: ${args?.name || "unknown"}`, {
            type: "policy_not_found",
            details: { policyName: args?.name },
          });
        }

        if (error.message.includes("execution_exception") || error.message.includes("failed")) {
          throw createExecutePolicyMcpError(`Policy execution failed: ${error.message}`, {
            type: "execution_failed",
            details: { originalError: error.message, policyName: args?.name },
          });
        }
      }

      throw createExecutePolicyMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Implementation function without read-only checks for withReadOnlyCheck wrapper
  const executePolicyImpl = async (
    params: ExecutePolicyParams,
    _extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    return executePolicyHandler(params);
  };

  // Tool registration - WRITE operation with read-only mode protection
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_enrich_execute_policy",

    {

      title: "Enrich Execute Policy",

      description: "Execute Elasticsearch enrich policy to create the enrich index. Best for policy activation, data preparation, enrichment setup. Use when you need to build the enrich index from source data for document enrichment in Elasticsearch.",

      inputSchema: {
      name: z.string(), // Name of the enrich policy to execute
      masterTimeout: z.string().optional(), // Timeout for master node operations. Examples: '30s', '1m'
      waitForCompletion: z.boolean().optional(), // Whether to wait for the policy execution to complete before returning
    },

    },

    withReadOnlyCheck("elasticsearch_enrich_execute_policy", executePolicyImpl, OperationType.WRITE),

  );;
};
