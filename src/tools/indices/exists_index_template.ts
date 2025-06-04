/* src/tools/indices/exists_index_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema
const ExistsIndexTemplateParams = z.object({
  name: z.string().min(1, "Template name is required"),
  local: z.boolean().optional(),
  flat_settings: z.boolean().optional(),
  master_timeout: z.string().optional(),
});

type ExistsIndexTemplateParamsType = z.infer<typeof ExistsIndexTemplateParams>;

export const registerExistsIndexTemplateTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_exists_index_template",
    "Check if index templates exist in Elasticsearch. Best for template validation, deployment verification, configuration checks. Use when you need to verify index template presence before operations in Elasticsearch.",
    {
      name: z.string().min(1, "Template name is required"),
      local: z.boolean().optional(),
      flat_settings: z.boolean().optional(),
      master_timeout: z.string().optional(),
    },
    async (params: ExistsIndexTemplateParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.existsIndexTemplate({
          name: params.name,
          local: params.local,
          flat_settings: params.flat_settings,
          master_timeout: params.master_timeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ exists: result }, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to check if index template exists:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
};
