/* src/tools/template/search_template.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const SearchTemplateParams = z.object({
  index: z.string().optional(),
  id: z.string().optional(),
  source: z.string().optional(),
  params: z.object({}).passthrough().optional(),
  explain: booleanField().optional(),
  profile: booleanField().optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z.string().optional(),
  ignoreUnavailable: booleanField().optional(),
  ignoreThrottled: booleanField().optional(),
  preference: z.string().optional(),
  routing: z.string().optional(),
  scroll: z.string().optional(),
  searchType: z.string().optional(),
  typedKeys: booleanField().optional(),
});

type SearchTemplateParamsType = z.infer<typeof SearchTemplateParams>;
export const registerSearchTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_search_template",
    "Execute a search template in Elasticsearch. Best for parameterized queries, reusable search patterns, query standardization. Use when you need to run templated searches with dynamic parameters in Elasticsearch.",
    {
      index: z.string().optional(),
      id: z.string().optional(),
      source: z.string().optional(),
      params: z.object({}).passthrough().optional(),
      explain: booleanField().optional(),
      profile: booleanField().optional(),
      allowNoIndices: booleanField().optional(),
      expandWildcards: z.string().optional(),
      ignoreUnavailable: booleanField().optional(),
      ignoreThrottled: booleanField().optional(),
      preference: z.string().optional(),
      routing: z.string().optional(),
      scroll: z.string().optional(),
      searchType: z.string().optional(),
      typedKeys: booleanField().optional(),
    },
    async (params: SearchTemplateParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.searchTemplate(params, {
          opaqueId: "elasticsearch_search_template",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to execute search template:", {
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
