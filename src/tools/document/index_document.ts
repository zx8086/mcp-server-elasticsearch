import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerIndexDocumentTool(server, esClient) {
  server.tool(
    "index_document",
    "Index a document into Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      id: z.string().optional(),
      document: z.record(z.any()),
      refresh: z.string().optional(),
      routing: z.string().optional(),
      pipeline: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.index({
          index: params.index,
          id: params.id,
          document: params.document,
          refresh: params.refresh,
          routing: params.routing,
          pipeline: params.pipeline,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to index document:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 