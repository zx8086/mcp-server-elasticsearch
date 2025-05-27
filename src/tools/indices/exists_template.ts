/* src/tools/indices/exists_template.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const ExistsTemplateParams = z.object({
  name: z.union([z.string(), z.array(z.string())]),
  flat_settings: z.boolean().optional(),
  local: z.boolean().optional(),
  master_timeout: z.string().optional(),
});

type ExistsTemplateParamsType = z.infer<typeof ExistsTemplateParams>;

export const registerExistsTemplateTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "exists_template",
    "Check existence of index templates. Get information about whether index templates exist. Index templates define settings, mappings, and aliases that can be applied automatically to new indices. IMPORTANT: This documentation is about legacy index templates, which are deprecated and will be replaced by the composable templates introduced in Elasticsearch 7.8.",
    {
      name: z.union([z.string(), z.array(z.string())]),
      flat_settings: z.boolean().optional(),
      local: z.boolean().optional(),
      master_timeout: z.string().optional(),
    },
    async (params: ExistsTemplateParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.existsTemplate({
          name: params.name,
          flat_settings: params.flat_settings,
          local: params.local,
          master_timeout: params.master_timeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ exists: result }, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to check if template exists:", {
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
