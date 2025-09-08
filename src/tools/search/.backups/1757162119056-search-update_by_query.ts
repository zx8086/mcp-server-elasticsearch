/* src/tools/search/update_by_query.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const updateByQuerySchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "Index name or pattern to update",
    },
    query: {
      type: "object",
      additionalProperties: true,
      description: "Query DSL to select documents to update",
    },
    script: {
      type: "object",
      additionalProperties: true,
      description: "Script to apply to matching documents",
    },
    maxDocs: {
      type: "number",
    },
    conflicts: {
      type: "string",
      enum: ["abort", "proceed"],
    },
    refresh: {
      type: "boolean",
    },
    timeout: {
      type: "string",
    },
    waitForActiveShards: {
      oneOf: [
        { type: "string", const: "all" },
        { type: "number", minimum: 1, maximum: 9 },
      ],
    },
    waitForCompletion: {
      type: "boolean",
    },
    requestsPerSecond: {
      type: "number",
    },
    scroll: {
      type: "string",
    },
    scrollSize: {
      type: "number",
    },
    searchType: {
      type: "string",
      enum: ["query_then_fetch", "dfs_query_then_fetch"],
    },
    searchTimeout: {
      type: "string",
    },
    slices: {
      type: "number",
    },
  },
  required: ["index", "query"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const updateByQueryValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  query: z.object({}).passthrough(),
  script: z.object({}).passthrough().optional(),
  maxDocs: z.number().optional(),
  conflicts: z.enum(["abort", "proceed"]).optional(),
  refresh: booleanField().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
  waitForCompletion: booleanField().optional(),
  requestsPerSecond: z.number().optional(),
  scroll: z.string().optional(),
  scrollSize: z.number().optional(),
  searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
  searchTimeout: z.string().optional(),
  slices: z.number().optional(),
});

type UpdateByQueryParams = z.infer<typeof updateByQueryValidator>;

// MCP error handling
function createUpdateByQueryMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_update_by_query] ${message}`, context.details);
}

// Tool implementation
export const registerUpdateByQueryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const updateByQueryHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = updateByQueryValidator.parse(args);

      const result = await esClient.updateByQuery(
        {
          index: params.index,
          query: params.query,
          script: params.script,
          max_docs: params.maxDocs,
          conflicts: params.conflicts,
          refresh: params.refresh,
          timeout: params.timeout,
          wait_for_active_shards: params.waitForActiveShards,
          wait_for_completion: params.waitForCompletion,
          requests_per_second: params.requestsPerSecond,
          scroll: params.scroll,
          scroll_size: params.scrollSize,
          search_type: params.searchType,
          search_timeout: params.searchTimeout,
          slices: params.slices,
        },
        {
          opaqueId: "elasticsearch_update_by_query",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createUpdateByQueryMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createUpdateByQueryMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_update_by_query",

    {

      title: "Update By Query",

      description: "Update documents by query in Elasticsearch. Best for bulk document updates, field modifications, script-based transformations. Use when you need to update multiple documents based on query conditions rather than individual document updates. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: updateByQuerySchema,

    },

    updateByQueryHandler,

  );
};
