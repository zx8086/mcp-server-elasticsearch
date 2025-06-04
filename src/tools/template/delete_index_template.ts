/* src/tools/template/delete_index_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const DeleteIndexTemplateParams = z.object({
  name: z.string().min(1, "Template name is required"),
  masterTimeout: z.string().optional(),
});

type DeleteIndexTemplateParamsType = z.infer<typeof DeleteIndexTemplateParams>;
export const registerDeleteIndexTemplateTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_delete_index_template",
    "Delete an index template in Elasticsearch. Best for: template management, configuration cleanup, removing unused templates. Use when you need to remove Elasticsearch index templates that define settings and mappings for new indices.",
    {
      name: z.string().min(1, "Template name is required"),
      masterTimeout: z.string().optional(),
    },
    async (params: DeleteIndexTemplateParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.deleteIndexTemplate({
          name: params.name,
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to delete index template:", {
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
