/* src/tools/search/scroll_search.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerScrollSearchTool(server, esClient) {
  server.tool(
    "scroll_search",
    "Perform a scroll search in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      query: z.record(z.any()),
      scroll: z.string().default('30s'),
      scrollId: z.string().optional(),
      maxDocuments: z.number().optional(),
      restTotalHitsAsInt: z.boolean().optional(),
    },
    async (params) => {
      try {
        // If scrollId is provided, use the traditional scroll API
        if (params.scrollId) {
          const result = await esClient.scroll({
            scroll_id: params.scrollId,
            scroll: params.scroll,
            rest_total_hits_as_int: params.restTotalHitsAsInt,
          }, {
            opaqueId: 'scroll_search'
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        // Otherwise, use the helper API for better memory management
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
        logger.error("Failed to perform scroll search:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 