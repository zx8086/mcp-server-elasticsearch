/* src/tools/watcher/start.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const startWatcherSchema = {
  type: "object",
  properties: {
    master_timeout: {
      type: "string",
      description: "Explicit operation timeout for connection to master node",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const startWatcherValidator = z.object({
  master_timeout: z.string().optional(),
});

type StartWatcherParams = z.infer<typeof startWatcherValidator>;

// MCP error handling
function createStartWatcherMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_start] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherStartTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const startWatcherHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = startWatcherValidator.parse(args);

      const result = await esClient.watcher.start({
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
        throw createStartWatcherMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createStartWatcherMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_watcher_start",

    {

      title: "Watcher Start",

      description: "Start the Elasticsearch Watcher service. Best for service management, monitoring activation, system initialization. Use when you need to enable the Watcher service for Elasticsearch alerting and monitoring capabilities. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: startWatcherSchema,

    },

    withReadOnlyCheck("elasticsearch_watcher_start", startWatcherHandler, OperationType.WRITE),

  );;
};
