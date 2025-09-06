/* src/tools/search/multi_search.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const multiSearchValidator = z.object({
  searches: z.array(z.object({}).passthrough()),
  index: z.string().optional(),
  maxConcurrentSearches: z.number().optional(),
  ccsMinimizeRoundtrips: booleanField().optional(),
  restTotalHitsAsInt: booleanField().optional(),
  typedKeys: booleanField().optional(),
});

type MultiSearchParams = z.infer<typeof multiSearchValidator>;

// MCP error handling
function createMultiSearchMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_multi_search] ${message}`, context.details);
}

// Tool implementation
export const registerMultiSearchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const multiSearchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = multiSearchValidator.parse(args);

      const result = await esClient.msearch({
        searches: params.searches,
        index: params.index,
        max_concurrent_searches: params.maxConcurrentSearches,
        ccs_minimize_roundtrips: params.ccsMinimizeRoundtrips,
        rest_total_hits_as_int: params.restTotalHitsAsInt,
        typed_keys: params.typedKeys,
      });

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
        throw createMultiSearchMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createMultiSearchMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_multi_search",
    "Perform multiple searches in Elasticsearch in a single request. Best for batch search operations, dashboard queries, parallel search execution. Use when you need to execute multiple Query DSL searches across different Elasticsearch indices efficiently. Uses direct JSON Schema and standardized MCP error codes.",
    {
      searches: z.array(z.object({}).optional()).optional(),
      index: z.string().optional(),
      maxConcurrentSearches: z.number().optional(),
      ccsMinimizeRoundtrips: z.boolean().optional(),
      restTotalHitsAsInt: z.boolean().optional(),
      typedKeys: z.boolean().optional(),
    },
    multiSearchHandler,
  );
};
