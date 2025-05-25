/* src/tools/template/delete_index_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerDeleteIndexTemplateTool(server, esClient) {
  server.tool(
    "delete_index_template",
    "Delete an index template in Elasticsearch",
    {
      name: z.string().min(1, "Template name is required"),
      masterTimeout: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.deleteIndexTemplate({
          name: params.name,
          master_timeout: params.masterTimeout,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to delete index template:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 