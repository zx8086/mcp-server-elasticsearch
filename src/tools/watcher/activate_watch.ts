/* src/tools/watcher/activate_watch.ts */
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
const activateWatchValidator = z.object({
  watch_id: z.string().min(1, "Watch ID cannot be empty"),
});

type ActivateWatchParams = z.infer<typeof activateWatchValidator>;

// MCP error handling
function createActivateWatchMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    watch_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_activate_watch] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherActivateWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const activateWatchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = activateWatchValidator.parse(args);

      const result = await esClient.watcher.activateWatch({
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
        throw createActivateWatchMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Add specific watch error handling
      if (error instanceof Error && error.message.includes("watch_not_found")) {
        throw createActivateWatchMcpError(error.message, {
          type: "watch_not_found",
          details: { watchId: args.watch_id },
        });
      }

      throw createActivateWatchMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_watcher_activate_watch",
    "Activate a watch in Elasticsearch Watcher. Best for monitoring automation, alerting management, watch lifecycle control. Use when you need to enable watch execution for Elasticsearch alerting and monitoring workflows. Uses direct JSON Schema and standardized MCP error codes.",
    {
      watch_id: z.string(), // Watch ID to activate
    },
    withReadOnlyCheck("elasticsearch_watcher_activate_watch", activateWatchHandler, OperationType.WRITE),
  );
};
