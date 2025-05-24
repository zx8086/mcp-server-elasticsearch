import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerScrollSearchTool(server, esClient) {
  server.tool(
    "scroll_search",
    "Perform a scroll search in Elasticsearch",
    {
      scrollId: z.string().min(1, "Scroll ID is required"),
      scroll: z.string().optional(),
      restTotalHitsAsInt: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.scroll({
          scroll_id: params.scrollId,
          scroll: params.scroll,
          rest_total_hits_as_int: params.restTotalHitsAsInt,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to perform scroll search:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 