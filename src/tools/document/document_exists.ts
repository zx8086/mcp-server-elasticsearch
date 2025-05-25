/* src/tools/document/document_exists.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerDocumentExistsTool(server, esClient) {
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
      versionType: z.string().optional(),
    },
    async (params) => {
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
        return { content: [{ type: "text", text: `Exists: ${exists}` }] };
      } catch (error) {
        logger.error("Failed to check if document exists:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 