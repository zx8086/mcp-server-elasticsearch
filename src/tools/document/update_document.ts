/* src/tools/document/update_document.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const UpdateDocumentParams = z.object({
  index: z.string().min(1, "Index is required"),
  id: z.string().min(1, "Document ID is required"),
  doc: z.record(z.any()).optional(),
  script: z.record(z.any()).optional(),
  upsert: z.record(z.any()).optional(),
  docAsUpsert: z.boolean().optional(),
  detectNoop: z.boolean().optional(),
  scriptedUpsert: z.boolean().optional(),
  refresh: z.enum(["true", "false", "wait_for"]).optional(),
  routing: z.string().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
  ifSeqNo: z.number().optional(),
  ifPrimaryTerm: z.number().optional(),
});

type UpdateDocumentParamsType = z.infer<typeof UpdateDocumentParams>;

export const registerUpdateDocumentTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "elasticsearch_update_document",
    "Update a JSON document in Elasticsearch by index and id. Best for partial document updates, scripted updates, upsert operations. Use when you need to modify existing documents in Elasticsearch indices with optimistic concurrency control.",
    {
      index: z.string().min(1, "Index is required"),
      id: z.string().min(1, "Document ID is required"),
      doc: z.record(z.any()).optional(),
      script: z.record(z.any()).optional(),
      upsert: z.record(z.any()).optional(),
      docAsUpsert: z.boolean().optional(),
      detectNoop: z.boolean().optional(),
      scriptedUpsert: z.boolean().optional(),
      refresh: z.enum(["true", "false", "wait_for"]).optional(),
      routing: z.string().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
      ifSeqNo: z.number().optional(),
      ifPrimaryTerm: z.number().optional(),
    },
    async (params: UpdateDocumentParamsType): Promise<SearchResult> => {
      // Check read-only mode
      const readOnlyCheck = readOnlyManager.checkOperation("elasticsearch_update_document");
      if (!readOnlyCheck.allowed) {
        return readOnlyManager.createBlockedResponse("elasticsearch_update_document");
      }

      try {
        if (readOnlyCheck.warning) {
          logger.warn("Proceeding with document update", { 
            tool: "elasticsearch_update_document", 
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
          opaqueId: 'elasticsearch_update_document'
        });
        const response: SearchResult = { 
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent] 
        };
        
        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("elasticsearch_update_document", response);
        }
        
        return response;
      } catch (error) {
        logger.error("Failed to update document:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { 
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` } as TextContent] 
        };
      }
    }
  );
}    