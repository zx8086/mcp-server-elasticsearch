import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerScrollSearchEnhancedTool(server, esClient) {
  server.tool(
    "scroll_search_enhanced",
    "Perform scroll search with automatic management",
    {
      index: z.string(),
      query: z.record(z.any()),
      scroll: z.string().default('30s'),
      maxDocuments: z.number().optional(),
    },
    async (params) => {
      try {
        const documents = [];
        let count = 0;
        
        const scrollSearch = esClient.helpers.scrollSearch({
          index: params.index,
          query: params.query,
          scroll: params.scroll
        });

        for await (const result of scrollSearch) {
          for (const doc of result.documents) {
            documents.push(doc);
            count++;
            
            if (params.maxDocuments && count >= params.maxDocuments) {
              await result.clear();
              break;
            }
          }
          
          if (params.maxDocuments && count >= params.maxDocuments) {
            break;
          }
        }

        return {
          content: [
            { type: "text", text: `Retrieved ${documents.length} documents` },
            { type: "text", text: JSON.stringify(documents, null, 2) }
          ]
        };
      } catch (error) {
        logger.error("Enhanced scroll search failed:", error);
        return { 
          content: [{ 
            type: "text", 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }] 
        };
      }
    }
  );
} 