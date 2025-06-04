/* src/tools/document/delete_document.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const DeleteDocumentParams = z.object({
  index: z.string().min(1, "Index is required"),
  id: z.string().min(1, "Document ID is required"),
  routing: z.string().optional(),
  refresh: z.enum(["true", "false", "wait_for"]).optional(),
  version: z.number().optional(),
  versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
  ifSeqNo: z.number().optional(),
  ifPrimaryTerm: z.number().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
});

type DeleteDocumentParamsType = z.infer<typeof DeleteDocumentParams>;

export const registerDeleteDocumentTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "delete_document",
    "Delete a document from Elasticsearch by index and id",
    {
      index: z.string().min(1, "Index is required"),
      id: z.string().min(1, "Document ID is required"),
      routing: z.string().optional(),
      refresh: z.enum(["true", "false", "wait_for"]).optional(),
      version: z.number().optional(),
      versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
      ifSeqNo: z.number().optional(),
      ifPrimaryTerm: z.number().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
    },
    async (params: DeleteDocumentParamsType): Promise<SearchResult> => {
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
        const response: SearchResult = { 
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent] 
        };
        
        // Add warning to response if in warning mode
        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("delete_document", response);
        }
        
        return response;
      } catch (error) {
        logger.error("Failed to delete document:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { 
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` } as TextContent] 
        };
      }
    }
  );
} 