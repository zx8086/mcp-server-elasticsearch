/* src/tools/watcher/ack_watch.ts */
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
const ackWatchValidator = z.object({
  watch_id: z.string().min(1, "Watch ID cannot be empty"),
  action_id: z.union([z.string(), z.array(z.string())]).optional(),
});

type _AckWatchParams = z.infer<typeof ackWatchValidator>;

// MCP error handling
function createAckWatchMcpError(
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
    `[elasticsearch_watcher_ack_watch] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherAckWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const ackWatchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = ackWatchValidator.parse(args);

      const result = await esClient.watcher.ackWatch({
        watch_id: params.watch_id,
        action_id: params.action_id,
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
        throw createAckWatchMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      // Add specific watch error handling
      if (error instanceof Error && error.message.includes("watch_not_found")) {
        throw createAckWatchMcpError(error.message, {
          type: "watch_not_found",
          details: { watchId: args.watch_id },
        });
      }

      throw createAckWatchMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_watcher_ack_watch",

    {
      title: "Watcher Ack Watch",

      description:
        "Acknowledge a watch in Elasticsearch Watcher to throttle actions. Best for alert management, action throttling, notification control. Use when you need to manually acknowledge watch actions to prevent repeated executions in Elasticsearch alerting. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        watch_id: z.string(), // Watch ID to acknowledge
        action_id: z.any().optional(), // Action ID(s) to acknowledge
      },
    },

    withReadOnlyCheck("elasticsearch_watcher_ack_watch", ackWatchHandler, OperationType.WRITE),
  );
};
