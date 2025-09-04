/* src/tools/watcher/query_watches.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const queryWatchesSchema = {
  type: "object",
  properties: {
    from: {
      type: "number",
      minimum: 0,
      description: "Starting offset for pagination"
    },
    size: {
      type: "number",
      minimum: 1,
      maximum: 50,
      description: "Number of watches to return"
    },
    query: {
      type: "object",
      additionalProperties: true,
      description: "Query to filter watches"
    },
    sort: {
      oneOf: [
        { type: "string" },
        { type: "object", additionalProperties: true },
        {
          type: "array",
          items: {
            oneOf: [
              { type: "string" },
              { type: "object", additionalProperties: true }
            ]
          }
        }
      ],
      description: "Sort criteria for results"
    },
    search_after: {
      type: "array",
      items: {
        oneOf: [
          { type: "number" },
          { type: "string" },
          { type: "boolean" },
          { type: "null" }
        ]
      },
      description: "Values to search after for pagination"
    }
  },
  additionalProperties: false
};

// Zod validator for runtime validation
const queryWatchesValidator = z.object({
  from: z.number().min(0).optional(),
  size: z.number().min(1).max(50).optional(),
  query: z.object({}).passthrough().optional(),
  sort: z
    .union([z.string(), z.object({}).passthrough(), z.array(z.union([z.string(), z.object({}).passthrough()]))])
    .optional(),
  search_after: z.array(z.union([z.number(), z.string(), booleanField(), z.null()])).optional(),
});

type QueryWatchesParams = z.infer<typeof queryWatchesValidator>;

// MCP error handling
function createQueryWatchesMcpError(
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
    `[elasticsearch_watcher_query_watches] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerWatcherQueryWatchesTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const queryWatchesHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = queryWatchesValidator.parse(args);
      
      const result = await esClient.watcher.queryWatches({
        from: params.from,
        size: params.size,
        query: params.query,
        sort: params.sort,
        search_after: params.search_after,
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
        throw createQueryWatchesMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      throw createQueryWatchesMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_watcher_query_watches",
    "Query and filter watches in Elasticsearch Watcher. Best for watch discovery, configuration management, monitoring overview. Use when you need to search and paginate through watch definitions in Elasticsearch alerting system. Uses direct JSON Schema and standardized MCP error codes.",
    queryWatchesSchema,
    withReadOnlyCheck("elasticsearch_watcher_query_watches", queryWatchesHandler, OperationType.READ)
  );
};
