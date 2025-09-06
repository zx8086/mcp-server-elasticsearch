/* src/tools/ilm/retry.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

/* SIMPLIFIED VERSION: Direct JSON Schema + MCP Error Codes */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// =============================================================================
// 1. SIMPLIFIED SCHEMA APPROACH
// =============================================================================

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Simple Zod validator for runtime validation only
const retryValidator = z.object({
  index: z.string().min(1, "Index name cannot be empty"),
});

type RetryParams = z.infer<typeof retryValidator>;

// =============================================================================
// 2. STANDARDIZED MCP ERROR HANDLING
// =============================================================================

function createIlmRetryMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "permission" | "index_not_found" | "no_failed_step";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    permission: ErrorCode.InvalidRequest,
    index_not_found: ErrorCode.InvalidParams,
    no_failed_step: ErrorCode.InvalidRequest,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_ilm_retry] ${message}`, context.details);
}

// =============================================================================
// 3. SIMPLIFIED TOOL IMPLEMENTATION
// =============================================================================

export const registerRetryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const retryHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Simple validation - no complex parameter extraction
      const params = retryValidator.parse(args);

      logger.debug("Retrying ILM policy execution", {
        index: params.index,
      });

      // First, check if the index has any ILM errors to retry
      try {
        const explainResult = await esClient.ilm.explainLifecycle({
          index: params.index,
        });
        
        // Check if any indices have failed steps
        const hasFailedSteps = Object.values(explainResult.indices || {}).some((indexInfo: any) => 
          indexInfo.step_info?.failed_step || 
          indexInfo.phase_execution?.failed_step ||
          (indexInfo.step_info && indexInfo.step_info.error)
        );

        if (!hasFailedSteps) {
          const indexNames = Object.keys(explainResult.indices || {});
          throw new Error(`No ILM errors found for indices matching pattern '${params.index}'. Found ${indexNames.length} indices: ${indexNames.slice(0, 5).join(', ')}${indexNames.length > 5 ? '...' : ''}. None are in ERROR state requiring retry.`);
        }

        logger.info("Found ILM errors to retry", {
          index: params.index,
          indicesWithErrors: Object.keys(explainResult.indices || {}).filter((name: string) => {
            const indexInfo = explainResult.indices[name] as any;
            return indexInfo.step_info?.failed_step || 
                   indexInfo.phase_execution?.failed_step ||
                   (indexInfo.step_info && indexInfo.step_info.error);
          }),
        });

      } catch (explainError) {
        logger.warn("Could not pre-check ILM status", {
          error: explainError instanceof Error ? explainError.message : String(explainError),
        });
        // Continue with retry attempt - the error might be more informative
      }

      const result = await esClient.ilm.retry({
        index: params.index,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow ILM operation: retry", { duration, index: params.index });
      }

      logger.info("ILM policy retry initiated", { index: params.index });

      // MCP-compliant success response
      return {
        content: [
          {
            type: "text",
            text: `🔄 **ILM Policy Retry Initiated: ${params.index}**

Retry operation has been triggered for indices in ERROR state.

⚙️ **What happens next:**
1. Elasticsearch will re-attempt the failed ILM step(s)
2. If successful, indices will progress to the next phase
3. If still failing, indices will remain in ERROR state

ℹ️ **Monitor Progress**: Use \`elasticsearch_ilm_explain_lifecycle\` to check if errors are resolved.
⚠️ **Note**: This only affects indices currently in ERROR state for ILM.

Operation completed at: ${new Date().toISOString()}`,
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                acknowledged: result.acknowledged || true,
                index_pattern: params.index,
                operation: "retry",
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      // Standardized MCP error handling
      if (error instanceof z.ZodError) {
        throw createIlmRetryMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("security_exception")) {
          throw createIlmRetryMcpError("Insufficient permissions to retry ILM policy", {
            type: "permission",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("index_not_found") || error.message.includes("no such index")) {
          throw createIlmRetryMcpError(`Index not found: ${params?.index || "unknown"}`, {
            type: "index_not_found",
            details: { suggestion: "Verify the index name or pattern exists" },
          });
        }

        // Handle the specific "cannot retry an action" error
        if (error.message.includes("illegal_argument_exception") && 
            error.message.includes("cannot retry an action for an index")) {
          
          let enhancedMessage = `Cannot retry ILM for index '${params?.index}': ${error.message}`;
          
          if (error.message.includes("has not encountered an error")) {
            enhancedMessage += "\n\nThis means the index is not currently in an ERROR state in its ILM lifecycle.";
            enhancedMessage += "\n\nPossible reasons:";
            enhancedMessage += "\n• The index is progressing normally through its ILM policy";
            enhancedMessage += "\n• Previous errors have already been resolved";
            enhancedMessage += "\n• The index doesn't have an ILM policy assigned";
            enhancedMessage += "\n• The specified index pattern doesn't match any indices with ILM errors";
            enhancedMessage += "\n\n💡 Suggestion: Use 'elasticsearch_ilm_explain_lifecycle' to check the current ILM status.";
          }

          throw createIlmRetryMcpError(enhancedMessage, {
            type: "no_failed_step",
            details: { 
              index: params?.index,
              originalError: error.message,
              suggestion: "Use elasticsearch_ilm_explain_lifecycle to verify ILM status and identify indices in ERROR state" 
            },
          });
        }

        if (error.message.includes("no_failed_step") || error.message.includes("not in error state")) {
          throw createIlmRetryMcpError(`No failed ILM steps to retry for: ${params?.index || "unknown"}`, {
            type: "no_failed_step",
            details: { suggestion: "Use explain_lifecycle to check if indices are in ERROR state" },
          });
        }
      }

      throw createIlmRetryMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Direct tool registration with JSON Schema + read-only protection
  server.tool(
    "elasticsearch_ilm_retry",
    "Retry ILM policy execution. Retry Index Lifecycle Management policy execution for indices in ERROR state. Uses direct JSON Schema and standardized MCP error codes. Examples: {index: 'logs-*'}, {index: 'failed-index-000001'}",
    {
      index: z.string(), // Index name or pattern to retry ILM policy execution for (cannot be empty)
    }, // Direct JSON Schema - no Zod conversion
    withReadOnlyCheck("elasticsearch_ilm_retry", retryHandler, OperationType.WRITE),
  );
};
