/* src/tools/watcher/get_watch.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const getWatchSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Watch ID to retrieve",
    },
  },
  required: ["id"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const getWatchValidator = z.object({
  id: z.string().min(1, "Watch ID cannot be empty"),
});

type GetWatchParams = z.infer<typeof getWatchValidator>;

// MCP error handling
function createGetWatchMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    watch_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_get_watch] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherGetWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getWatchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = getWatchValidator.parse(args);

      const result = await esClient.watcher.getWatch({
        id: params.id,
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
        throw createGetWatchMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Add specific watch error handling
      if (error instanceof Error && error.message.includes("watch_not_found")) {
        throw createGetWatchMcpError(error.message, {
          type: "watch_not_found",
          details: { watchId: args.id },
        });
      }

      throw createGetWatchMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_watcher_get_watch",

    {

      title: "Watcher Get Watch",

      description: "Get a watch configuration from Elasticsearch Watcher. Best for monitoring automation, alerting configuration, watch inspection. Use when you need to retrieve watch definitions for Elasticsearch alerting and monitoring workflows. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: getWatchSchema,

    },

    withReadOnlyCheck("elasticsearch_watcher_get_watch", getWatchHandler, OperationType.READ),

  );;
};
