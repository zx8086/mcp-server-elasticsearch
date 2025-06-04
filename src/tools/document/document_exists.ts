/* src/tools/document/document_exists.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const DocumentExistsParams = z.object({
  index: z.string().min(1, "Index is required"),
  id: z.string().min(1, "Document ID is required"),
  routing: z.string().optional(),
  preference: z.string().optional(),
  realtime: z.boolean().optional(),
  refresh: z.boolean().optional(),
  version: z.number().optional(),
  versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
});

type DocumentExistsParamsType = z.infer<typeof DocumentExistsParams>;

export const registerDocumentExistsTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "document_exists",
    "Check if a document exists in Elasticsearch by index and id",
    {
      index: z.string().min(1, "Index is required"),
      id: z.string().min(1, "Document ID is required"),
      routing: z.string().optional(),
      preference: z.string().optional(),
      realtime: z.boolean().optional(),
      refresh: z.boolean().optional(),
      version: z.number().optional(),
      versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
    },
    async (params: DocumentExistsParamsType): Promise<SearchResult> => {
      try {
        const exists = await esClient.exists({
          index: params.index,
          id: params.id,
          routing: params.routing,
          preference: params.preference,
          realtime: params.realtime,
          refresh: params.refresh,
          version: params.version,
          version_type: params.versionType,
        });
        return { content: [{ type: "text", text: `Exists: ${exists}` } as TextContent] };
      } catch (error) {
        logger.error("Failed to check if document exists:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` } as TextContent] };
      }
    }
  );
} 