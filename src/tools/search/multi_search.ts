/* src/tools/search/multi_search.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const MultiSearchParams = z.object({
  searches: z.array(z.record(z.any())),
  index: z.string().optional(),
  maxConcurrentSearches: z.number().optional(),
  ccsMinimizeRoundtrips: z.boolean().optional(),
  restTotalHitsAsInt: z.boolean().optional(),
  typedKeys: z.boolean().optional(),
});

type MultiSearchParamsType = z.infer<typeof MultiSearchParams>;
export const registerMultiSearchTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_multi_search",
    "Perform multiple searches in Elasticsearch in a single request. Best for batch search operations, dashboard queries, parallel search execution. Use when you need to execute multiple Query DSL searches across different Elasticsearch indices efficiently.",
    {
      searches: z.array(z.record(z.any())),
      index: z.string().optional(),
      maxConcurrentSearches: z.number().optional(),
      ccsMinimizeRoundtrips: z.boolean().optional(),
      restTotalHitsAsInt: z.boolean().optional(),
      typedKeys: z.boolean().optional(),
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
