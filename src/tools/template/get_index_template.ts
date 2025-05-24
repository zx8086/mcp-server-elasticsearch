import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetIndexTemplateTool(server, esClient) {
  server.tool(
    "get_index_template",
    "Get an index template from Elasticsearch",
    {
      name: z.string().optional(),
      flatSettings: z.boolean().optional(),
      masterTimeout: z.string().optional(),
      local: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.getIndexTemplate({
          name: params.name,
          flat_settings: params.flatSettings,
          master_timeout: params.masterTimeout,
          local: params.local,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get index template:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 