/* src/tools/template/get_index_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const GetIndexTemplateParams = z.object({
  name: z.string().optional(),
  flatSettings: z.boolean().optional(),
  masterTimeout: z.string().optional(),
  local: z.boolean().optional(),
});

type GetIndexTemplateParamsType = z.infer<typeof GetIndexTemplateParams>;
export const registerGetIndexTemplateTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "get_index_template",
    "Get an index template from Elasticsearch",
    {
      name: z.string().optional(),
      flatSettings: z.boolean().optional(),
      masterTimeout: z.string().optional(),
      local: z.boolean().optional(),
    },
    async (params: GetIndexTemplateParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.getIndexTemplate(
          {
            name: params.name,
            flat_settings: params.flatSettings,
            master_timeout: params.masterTimeout,
            local: params.local,
          },
          {
            opaqueId: "get_index_template",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get index template:", {
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
