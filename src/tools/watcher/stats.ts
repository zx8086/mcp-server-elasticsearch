/* src/tools/watcher/stats.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const watcherStatsSchema = {
  type: "object",
  properties: {
    metric: {
      oneOf: [
        {
          type: "string",
          enum: ["_all", "queued_watches", "current_watches", "pending_watches"]
        },
        {
          type: "array",
          items: {
            type: "string",
            enum: ["_all", "queued_watches", "current_watches", "pending_watches"]
          }
        }
      ],
      description: "Limit the information returned to specific metrics"
    },
    emit_stacktraces: {
      type: "boolean",
      description: "Whether to emit stack traces of currently running watches"
    }
  },
  additionalProperties: false
};

// Zod validator for runtime validation
const watcherStatsValidator = z.object({
  metric: z
    .union([
      z.enum(["_all", "queued_watches", "current_watches", "pending_watches"]),
      z.array(z.enum(["_all", "queued_watches", "current_watches", "pending_watches"])),
    ])
    .optional(),
  emit_stacktraces: booleanField().optional(),
});

type WatcherStatsParams = z.infer<typeof watcherStatsValidator>;

// MCP error handling
function createWatcherStatsMcpError(
  error: Error | string,
  context: { type: string; details?: any }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };
  
  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_stats] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerWatcherStatsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const watcherStatsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = watcherStatsValidator.parse(args);
      
      const result = await esClient.watcher.stats({
        metric: params.metric,
        emit_stacktraces: params.emit_stacktraces,
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
        throw createWatcherStatsMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      throw createWatcherStatsMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_watcher_stats",
    "Get Elasticsearch Watcher statistics and metrics. Best for performance monitoring, service analysis, execution tracking. Use when you need to monitor Watcher service performance and execution statistics in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",
    watcherStatsSchema,
    withReadOnlyCheck("elasticsearch_watcher_stats", watcherStatsHandler, OperationType.READ)
  );
};
