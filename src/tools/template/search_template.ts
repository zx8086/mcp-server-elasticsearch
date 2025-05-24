import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerSearchTemplateTool(server, esClient) {
  server.tool(
    "search_template",
    "Execute a search template in Elasticsearch",
    {
      index: z.string().optional(),
      id: z.string().optional(),
      source: z.string().optional(),
      params: z.record(z.any()).optional(),
      explain: z.boolean().optional(),
      profile: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      ignoreThrottled: z.boolean().optional(),
      preference: z.string().optional(),
      routing: z.string().optional(),
      scroll: z.string().optional(),
      searchType: z.string().optional(),
      typedKeys: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.searchTemplate(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to execute search template:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 