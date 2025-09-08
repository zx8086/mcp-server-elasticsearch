/* src/tools/search/count_documents.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const countDocumentsSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Index pattern to count documents in. Use '*' for all indices",
    },
    query: {
      type: "object",
      description: "Query DSL to filter documents. Default matches all",
      additionalProperties: true,
    },
    analyzer: {
      type: "string",
    },
    analyzeWildcard: {
      type: "boolean",
    },
    defaultOperator: {
      type: "string",
      enum: ["AND", "OR"],
    },
    df: {
      type: "string",
    },
    expandWildcards: {
      type: "string",
      enum: ["all", "open", "closed", "hidden", "none"],
    },
    ignoreThrottled: {
      type: "boolean",
    },
    ignoreUnavailable: {
      type: "boolean",
    },
    allowNoIndices: {
      type: "boolean",
    },
    minScore: {
      type: "number",
    },
    preference: {
      type: "string",
    },
    routing: {
      type: "string",
    },
    q: {
      type: "string",
    },
    terminateAfter: {
      type: "number",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const countDocumentsValidator = z.object({
  index: z.string().optional(),
  query: z.object({}).passthrough().optional(),
  analyzer: z.string().optional(),
  analyzeWildcard: z.boolean().optional(),
  defaultOperator: z.enum(["AND", "OR"]).optional(),
  df: z.string().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  ignoreThrottled: z.boolean().optional(),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  minScore: z.number().optional(),
  preference: z.string().optional(),
  routing: z.string().optional(),
  q: z.string().optional(),
  terminateAfter: z.number().optional(),
});

type CountDocumentsParams = z.infer<typeof countDocumentsValidator>;

// MCP error handling
function createCountDocumentsMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_count_documents] ${message}`, context.details);
}

// Tool implementation
export const registerCountDocumentsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const countDocumentsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = countDocumentsValidator.parse(args);

      const result = await esClient.count(
        {
          index: params.index,
          query: params.query,
          analyzer: params.analyzer,
          analyze_wildcard: params.analyzeWildcard,
          default_operator: params.defaultOperator,
          df: params.df,
          expand_wildcards: params.expandWildcards,
          ignore_throttled: params.ignoreThrottled,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          min_score: params.minScore,
          preference: params.preference,
          routing: params.routing,
          q: params.q,
          terminate_after: params.terminateAfter,
        },
        {
          opaqueId: "elasticsearch_count_documents",
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
        throw createCountDocumentsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createCountDocumentsMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_count_documents",

    {

      title: "Count Documents",

      description: "Count documents in Elasticsearch. PARAMETERS: 'index' (string, default '*'), 'query' (object, default match_all). Best for data analysis, result set sizing. Example: {index: 'logs-*', query: {match: {status: 'error'}}}. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: countDocumentsSchema,

    },

    countDocumentsHandler,

  );
};
