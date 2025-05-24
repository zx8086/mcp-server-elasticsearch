import { z } from "zod";
import { logger } from "../../utils/logger.js";

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
      try {
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to delete document:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 