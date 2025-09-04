/* src/tools/watcher/delete_watch.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const deleteWatchSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Watch ID to delete"
    }
  },
  required: ["id"],
  additionalProperties: false
};

// Zod validator for runtime validation
const deleteWatchValidator = z.object({
  id: z.string().min(1, "Watch ID cannot be empty"),
});

type DeleteWatchParams = z.infer<typeof deleteWatchValidator>;

// MCP error handling
function createDeleteWatchMcpError(
  error: Error | string,
  context: { type: string; details?: any }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    watch_not_found: ErrorCode.InvalidParams,
  };
  
  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_delete_watch] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerWatcherDeleteWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const deleteWatchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = deleteWatchValidator.parse(args);
      
      const result = await esClient.watcher.deleteWatch({
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
        throw createDeleteWatchMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      // Add specific watch error handling
      if (error instanceof Error && error.message.includes('watch_not_found')) {
        throw createDeleteWatchMcpError(error.message, {
          type: 'watch_not_found',
          details: { watchId: args.id }
        });
      }

      throw createDeleteWatchMcpError(error instanceof Error ? error.message : String(error), {
        type: 'execution',
        details: { 
          duration: performance.now() - perfStart,
          args 
        }
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_watcher_delete_watch",
    "Delete a watch from Elasticsearch Watcher. Best for watch cleanup, configuration management, removing unused monitors. Use when you need to permanently remove watch definitions from Elasticsearch alerting system. IMPORTANT: Use only this API, not direct index deletion. Uses direct JSON Schema and standardized MCP error codes.",
    deleteWatchSchema,
    withReadOnlyCheck("elasticsearch_watcher_delete_watch", deleteWatchHandler, OperationType.WRITE)
  );
};
