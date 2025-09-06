/* src/tools/watcher/deactivate_watch.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const deactivateWatchValidator = z.object({
  watch_id: z.string().min(1, "Watch ID cannot be empty"),
});

type DeactivateWatchParams = z.infer<typeof deactivateWatchValidator>;

// MCP error handling
function createDeactivateWatchMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    watch_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_deactivate_watch] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherDeactivateWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const deactivateWatchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = deactivateWatchValidator.parse(args);

      const result = await esClient.watcher.deactivateWatch({
        watch_id: params.watch_id,
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
        throw createDeactivateWatchMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Add specific watch error handling
      if (error instanceof Error && error.message.includes("watch_not_found")) {
        throw createDeactivateWatchMcpError(error.message, {
          type: "watch_not_found",
          details: { watchId: args.watch_id },
        });
      }

      throw createDeactivateWatchMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_watcher_deactivate_watch",
    "Deactivate a watch in Elasticsearch Watcher. Best for monitoring control, alerting management, watch lifecycle control. Use when you need to disable watch execution while preserving the watch definition in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",
    {
      watch_id: z.string(), // Watch ID to deactivate
    },
    withReadOnlyCheck("elasticsearch_watcher_deactivate_watch", deactivateWatchHandler, OperationType.WRITE),
  );
};
