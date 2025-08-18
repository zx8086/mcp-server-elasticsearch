/* src/tools/search/multi_search.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const MultiSearchParams = z.object({
  searches: z.array(z.object({}).passthrough()),
  index: z.string().optional(),
  maxConcurrentSearches: z.number().optional(),
  ccsMinimizeRoundtrips: booleanField().optional(),
  restTotalHitsAsInt: booleanField().optional(),
  typedKeys: booleanField().optional(),
});

type MultiSearchParamsType = z.infer<typeof MultiSearchParams>;
export const registerMultiSearchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_multi_search",
    "Perform multiple searches in Elasticsearch in a single request. Best for batch search operations, dashboard queries, parallel search execution. Use when you need to execute multiple Query DSL searches across different Elasticsearch indices efficiently.",
    {
      searches: z.array(z.object({}).passthrough()),
      index: z.string().optional(),
      maxConcurrentSearches: z.number().optional(),
      ccsMinimizeRoundtrips: booleanField().optional(),
      restTotalHitsAsInt: booleanField().optional(),
      typedKeys: booleanField().optional(),
    },
    async (params: MultiSearchParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.msearch({
          searches: params.searches,
          index: params.index,
          max_concurrent_searches: params.maxConcurrentSearches,
          ccs_minimize_roundtrips: params.ccsMinimizeRoundtrips,
          rest_total_hits_as_int: params.restTotalHitsAsInt,
          typed_keys: params.typedKeys,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to perform multi-search:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
};
