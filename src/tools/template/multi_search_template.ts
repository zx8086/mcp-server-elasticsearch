/* src/tools/template/multi_search_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerMultiSearchTemplateTool(server, esClient) {
  server.tool(
    "multi_search_template",
    "Execute multiple search templates in Elasticsearch",
    {
      searches: z.array(z.record(z.any())),
      index: z.string().optional(),
      maxConcurrentSearches: z.number().optional(),
      ccsMinimizeRoundtrips: z.boolean().optional(),
      restTotalHitsAsInt: z.boolean().optional(),
      typedKeys: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.msearchTemplate({
          searches: params.searches,
          index: params.index,
          max_concurrent_searches: params.maxConcurrentSearches,
          ccs_minimize_roundtrips: params.ccsMinimizeRoundtrips,
          rest_total_hits_as_int: params.restTotalHitsAsInt,
          typed_keys: params.typedKeys,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to execute multi-search template:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 