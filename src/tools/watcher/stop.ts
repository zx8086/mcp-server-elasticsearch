/* src/tools/watcher/stop.ts */
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
const stopWatcherValidator = z.object({
  master_timeout: z.string().optional(),
});

type StopWatcherParams = z.infer<typeof stopWatcherValidator>;

// MCP error handling
function createStopWatcherMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_stop] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherStopTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const stopWatcherHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = stopWatcherValidator.parse(args);

      const result = await esClient.watcher.stop({
        master_timeout: params.master_timeout,
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
        throw createStopWatcherMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createStopWatcherMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_watcher_stop",

    {

      title: "Watcher Stop",

      description: "Stop the Elasticsearch Watcher service. Best for service management, monitoring deactivation, maintenance operations. Use when you need to disable the Watcher service for Elasticsearch maintenance or troubleshooting. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
      master_timeout: z.string().optional(), // Explicit operation timeout for connection to master node
    },

    },

    withReadOnlyCheck("elasticsearch_watcher_stop", stopWatcherHandler, OperationType.WRITE),

  );;
};
