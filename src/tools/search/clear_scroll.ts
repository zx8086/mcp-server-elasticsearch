import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerClearScrollTool(server, esClient) {
  server.tool(
    "clear_scroll",
    "Clear a scroll context in Elasticsearch",
    {
      scrollId: z.string().min(1, "Scroll ID is required"),
    },
    async (params) => {
      try {
        const result = await esClient.clearScroll({
          scroll_id: params.scrollId,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to clear scroll:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 