/* src/tools/document/index_document.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const IndexDocumentParams = z.object({
  index: z.string().min(1, "Index is required"),
  id: z.string().optional(),
  document: z.record(z.any()),
  refresh: z.enum(["true", "false", "wait_for"]).optional(),
  routing: z.string().optional(),
  pipeline: z.string().optional(),
});

type IndexDocumentParamsType = z.infer<typeof IndexDocumentParams>;

export const registerIndexDocumentTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "index_document",
    "Index a document into Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      id: z.string().optional(),
      document: z.record(z.any()),
      refresh: z.enum(["true", "false", "wait_for"]).optional(),
      routing: z.string().optional(),
      pipeline: z.string().optional(),
    },
    async (params: IndexDocumentParamsType): Promise<SearchResult> => {
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
        const response: SearchResult = { 
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent] 
        };
        
        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("index_document", response);
        }
        
        return response;
      } catch (error) {
        logger.error("Failed to index document:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { 
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` } as TextContent] 
        };
      }
    }
  );
} 