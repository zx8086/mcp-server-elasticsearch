/* src/tools/watcher/execute_watch.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const executeWatchValidator = z.object({
  id: z.string().optional(),
  action_modes: z
    .record(z.string(), z.enum(["simulate", "force_simulate", "execute", "force_execute", "skip"]))
    .optional(),
  alternative_input: z.object({}).passthrough().optional(),
  ignore_condition: booleanField().optional(),
  record_execution: booleanField().optional(),
  simulated_actions: z
    .object({
      actions: z.array(z.string()).optional(),
      all: booleanField().optional(),
      use_all: booleanField().optional(),
    })
    .optional(),
  trigger_data: z
    .object({
      scheduled_time: z.string().optional(),
      triggered_time: z.string().optional(),
    })
    .optional(),
  watch: z
    .object({
      actions: z.object({}).passthrough().optional(),
      condition: z.object({}).passthrough().optional(),
      input: z.object({}).passthrough().optional(),
      metadata: z.object({}).passthrough().optional(),
      status: z.object({}).passthrough().optional(),
      throttle_period: z.string().optional(),
      throttle_period_in_millis: z.number().optional(),
      transform: z.object({}).passthrough().optional(),
      trigger: z.object({}).passthrough().optional(),
    })
    .optional(),
  debug: booleanField().optional(),
});

type _ExecuteWatchParams = z.infer<typeof executeWatchValidator>;

// MCP error handling
function createExecuteWatchMcpError(
  error: Error | string,
  context: { type: "validation" | "execution" | "watch_not_found"; details?: any },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    watch_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_execute_watch] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherExecuteWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const executeWatchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = executeWatchValidator.parse(args);

      const result = await esClient.watcher.executeWatch({
        id: params.id,
        action_modes: params.action_modes as any,
        alternative_input: params.alternative_input,
        ignore_condition: params.ignore_condition,
        record_execution: params.record_execution,
        simulated_actions: params.simulated_actions as any,
        trigger_data: params.trigger_data as any,
        watch: params.watch as any,
        debug: params.debug,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow watcher operation", { duration });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createExecuteWatchMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      // Add specific watch error handling
      if (error instanceof Error && error.message.includes("watch_not_found")) {
        throw createExecuteWatchMcpError(error.message, {
          type: "watch_not_found",
          details: { watchId: args.id },
        });
      }

      throw createExecuteWatchMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_watcher_execute_watch",

    {
      title: "Watcher Execute Watch",

      description:
        "Execute a watch in Elasticsearch Watcher for testing or debugging. Best for watch testing, debugging workflows, manual execution. Use when you need to force watch execution outside normal triggers in Elasticsearch alerting systems. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        id: z.string().optional(), // Watch ID to execute
        action_modes: z.object({}).optional(), // Override action execution modes
        alternative_input: z.object({}).optional(), // Alternative input to use instead of the watch input
        ignore_condition: z.boolean().optional(), // Whether to ignore the condition and always execute the actions
        record_execution: z.boolean().optional(), // Whether to record the execution in the watch history
        simulated_actions: z.object({}).optional(), // Actions to simulate instead of executing
        trigger_data: z.object({}).optional(), // Trigger data to use for execution
        watch: z.object({}).optional(), // Watch definition to execute inline
        debug: z.boolean().optional(), // Enable debug mode for execution
      },
    },

    withReadOnlyCheck("elasticsearch_watcher_execute_watch", executeWatchHandler, OperationType.WRITE),
  );
};
