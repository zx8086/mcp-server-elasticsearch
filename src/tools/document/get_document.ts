/* src/tools/document/get_document.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetDocumentTool(server, esClient) {
  server.tool(
    "get_document",
    "Get a document from Elasticsearch by index and id",
    {
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
      versionType: z.string().optional(),
    },
    async (params) => {
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get document:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 