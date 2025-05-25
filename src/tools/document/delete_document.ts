import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";

export function registerDeleteDocumentTool(server, esClient) {
  server.tool(
    "delete_document",
    "Delete a document from Elasticsearch by index and id",
    {
      index: z.string().min(1, "Index is required"),
      id: z.string().min(1, "Document ID is required"),
      routing: z.string().optional(),
      refresh: z.string().optional(),
      version: z.number().optional(),
      versionType: z.string().optional(),
      ifSeqNo: z.number().optional(),
      ifPrimaryTerm: z.number().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.string().optional(),
    },
    async (params) => {
      // Check read-only mode FIRST
      const readOnlyCheck = readOnlyManager.checkOperation("delete_document");
      if (!readOnlyCheck.allowed) {
        return readOnlyManager.createBlockedResponse("delete_document");
      }

      try {
        // Show warning if in warning mode
        if (readOnlyCheck.warning) {
          logger.warn("Proceeding with destructive operation", { 
            tool: "delete_document", 
            params: { index: params.index, id: params.id }
          });
        }

        const result = await esClient.delete({
          index: params.index,
          id: params.id,
          routing: params.routing,
          refresh: params.refresh,
          version: params.version,
          version_type: params.versionType,
          if_seq_no: params.ifSeqNo,
          if_primary_term: params.ifPrimaryTerm,
          timeout: params.timeout,
          wait_for_active_shards: params.waitForActiveShards,
        });
        const response = { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        
        // Add warning to response if in warning mode
        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("delete_document", response);
        }
        
        return response;
      } catch (error) {
        logger.error("Failed to delete document:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 