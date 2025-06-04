/* src/tools/template/multi_search_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const MultiSearchTemplateParams = z.object({
  searches: z.array(z.record(z.any())),
  index: z.string().optional(),
  maxConcurrentSearches: z.number().optional(),
  ccsMinimizeRoundtrips: z.boolean().optional(),
  restTotalHitsAsInt: z.boolean().optional(),
  typedKeys: z.boolean().optional(),
});

type MultiSearchTemplateParamsType = z.infer<typeof MultiSearchTemplateParams>;
export const registerMultiSearchTemplateTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_multi_search_template",
    "Execute multiple search templates in Elasticsearch. Best for batch search operations, templated queries, performance optimization. Use when you need to run multiple parameterized searches efficiently using Elasticsearch search templates.",
    {
      searches: z.array(z.record(z.any())),
      index: z.string().optional(),
      maxConcurrentSearches: z.number().optional(),
      ccsMinimizeRoundtrips: z.boolean().optional(),
      restTotalHitsAsInt: z.boolean().optional(),
      typedKeys: z.boolean().optional(),
    },
    async (params: MultiSearchTemplateParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.msearchTemplate({
          body: params.searches,
          index: params.index,
          max_concurrent_searches: params.maxConcurrentSearches,
          ccs_minimize_roundtrips: params.ccsMinimizeRoundtrips,
          rest_total_hits_as_int: params.restTotalHitsAsInt,
          typed_keys: params.typedKeys,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to execute multi-search template:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            } as TextContent,
          ],
        };
      }
    },
  );
};
