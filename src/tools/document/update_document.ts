import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";

export function registerUpdateDocumentTool(server, esClient) {
  server.tool(
    "update_document",
    "Update a document in Elasticsearch by index and id",
    {
      index: z.string().min(1, "Index is required"),
      id: z.string().min(1, "Document ID is required"),
      doc: z.record(z.any()).optional(),
      script: z.record(z.any()).optional(),
      upsert: z.record(z.any()).optional(),
      docAsUpsert: z.boolean().optional(),
      detectNoop: z.boolean().optional(),
      scriptedUpsert: z.boolean().optional(),
      refresh: z.string().optional(),
      routing: z.string().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.string().optional(),
      ifSeqNo: z.number().optional(),
      ifPrimaryTerm: z.number().optional(),
    },
    async (params) => {
      // Check read-only mode
      const readOnlyCheck = readOnlyManager.checkOperation("update_document");
      if (!readOnlyCheck.allowed) {
        return readOnlyManager.createBlockedResponse("update_document");
      }

      try {
        if (readOnlyCheck.warning) {
          logger.warn("Proceeding with document update", { 
            tool: "update_document", 
            params: { index: params.index, id: params.id }
          });
        }

        const result = await esClient.update({
          index: params.index,
          id: params.id,
          doc: params.doc,
          script: params.script,
          upsert: params.upsert,
          doc_as_upsert: params.docAsUpsert,
          detect_noop: params.detectNoop,
          scripted_upsert: params.scriptedUpsert,
          refresh: params.refresh,
          routing: params.routing,
          timeout: params.timeout,
          wait_for_active_shards: params.waitForActiveShards,
          if_seq_no: params.ifSeqNo,
          if_primary_term: params.ifPrimaryTerm,
        }, {
          opaqueId: 'update_document'
        });
        const response = { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        
        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("update_document", response);
        }
        
        return response;
      } catch (error) {
        logger.error("Failed to update document:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 