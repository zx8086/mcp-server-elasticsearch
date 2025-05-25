import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";

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
      // Check read-only mode
      const readOnlyCheck = readOnlyManager.checkOperation("index_document");
      if (!readOnlyCheck.allowed) {
        return readOnlyManager.createBlockedResponse("index_document");
      }

      try {
        if (readOnlyCheck.warning) {
          logger.warn("Proceeding with document indexing", { 
            tool: "index_document", 
            params: { index: params.index, id: params.id }
          });
        }

        const result = await esClient.index({
          index: params.index,
          id: params.id,
          document: params.document,
          refresh: params.refresh,
          routing: params.routing,
          pipeline: params.pipeline,
        }, {
          opaqueId: 'index_document'
        });
        const response = { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        
        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("index_document", response);
        }
        
        return response;
      } catch (error) {
        logger.error("Failed to index document:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 