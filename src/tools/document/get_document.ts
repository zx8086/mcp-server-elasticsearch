/* src/tools/document/get_document.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const GetDocumentParams = z.object({
  index: z.string().min(1, "Index is required"),
  id: z.string().min(1, "Document ID is required"),
  source: z.boolean().optional(),
  sourceExcludes: z.array(z.string()).optional(),
  sourceIncludes: z.array(z.string()).optional(),
  routing: z.string().optional(),
  preference: z.string().optional(),
  realtime: z.boolean().optional(),
  refresh: z.boolean().optional(),
  version: z.number().optional(),
  versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
});

type GetDocumentParamsType = z.infer<typeof GetDocumentParams>;

export const registerGetDocumentTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "elasticsearch_get_document",
    "Get a document from Elasticsearch by index and id. Best for: retrieving specific JSON documents, document validation, real-time data access. Use when you need to fetch individual documents by their unique identifier from Elasticsearch indices.",
    {
      index: z.string().min(1, "Index is required").describe("Name of the Elasticsearch index containing the document"),
      id: z.string().min(1, "Document ID is required").describe("Unique identifier of the document in the Elasticsearch index"),
      source: z.boolean().optional(),
      sourceExcludes: z.array(z.string()).optional(),
      sourceIncludes: z.array(z.string()).optional(),
      routing: z.string().optional(),
      preference: z.string().optional(),
      realtime: z.boolean().optional(),
      refresh: z.boolean().optional(),
      version: z.number().optional(),
      versionType: z.enum(["internal", "external", "external_gte", "force"]).optional(),
    },
    async (params: GetDocumentParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.get({
          index: params.index,
          id: params.id,
          _source: params.source,
          _source_excludes: params.sourceExcludes,
          _source_includes: params.sourceIncludes,
          routing: params.routing,
          preference: params.preference,
          realtime: params.realtime,
          refresh: params.refresh,
          version: params.version,
          version_type: params.versionType,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent] };
      } catch (error) {
        logger.error("Failed to get document:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` } as TextContent] };
      }
    }
  );
}  