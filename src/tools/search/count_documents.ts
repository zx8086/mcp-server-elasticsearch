/* src/tools/search/count_documents.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

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

      // Handle empty query object - Elasticsearch rejects empty queries
      const isEmptyQuery = !params.query || (typeof params.query === 'object' && Object.keys(params.query).length === 0);
      const finalQuery = isEmptyQuery ? undefined : params.query; // Let Elasticsearch default to match_all

      logger.debug("Count documents request", {
        index: params.index || "*",
        hasQuery: !!finalQuery,
        queryType: isEmptyQuery ? "match_all (default)" : "custom",
      });

      const result = await esClient.count(
        {
          index: params.index,
          ...(finalQuery && { query: finalQuery }), // Only include query if not empty
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

      // Handle specific query parsing errors
      if (error instanceof Error) {
        if (error.message.includes("parsing_exception") && error.message.includes("query malformed")) {
          let enhancedMessage = `Query parsing failed: ${error.message}`;
          
          if (error.message.includes("empty clause found")) {
            enhancedMessage += "\n\nThis error occurs when an empty query object {} is provided.";
            enhancedMessage += "\nSolutions:";
            enhancedMessage += "\n• Omit the query parameter to count all documents";
            enhancedMessage += "\n• Provide a valid query like {match_all: {}} or {match: {field: 'value'}}";
            enhancedMessage += "\n• Use the 'q' parameter for simple string queries instead";
          }

          throw createCountDocumentsMcpError(enhancedMessage, {
            type: "validation",
            details: {
              originalError: error.message,
              providedQuery: args.query,
              suggestion: "Remove query parameter or provide valid Query DSL",
            },
          });
        }

        if (error.message.includes("index_not_found_exception")) {
          throw createCountDocumentsMcpError(`Index not found: ${args.index || "*"}`, {
            type: "validation",
            details: { 
              providedIndex: args.index,
              suggestion: "Verify the index name or pattern exists" 
            },
          });
        }
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
  server.tool(
    "elasticsearch_count_documents",
    "Count documents in Elasticsearch. PARAMETERS: 'index' (string, default '*'), 'query' (object, default match_all). Best for data analysis, result set sizing. Example: {index: 'logs-*', query: {match: {status: 'error'}}}. Uses direct JSON Schema and standardized MCP error codes.",
    {
      index: z.string().optional(), // Index pattern to count documents in. Use '*' for all indices
      query: z.object({}).optional(), // Query DSL to filter documents. Default matches all
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
    },
    countDocumentsHandler,
  );
};
