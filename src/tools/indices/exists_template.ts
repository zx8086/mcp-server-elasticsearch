/* src/tools/indices/exists_template.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const ExistsTemplateParams = z.object({
  name: z.union([z.string(), z.array(z.string())]),
  flat_settings: booleanField().optional(),
  local: booleanField().optional(),
  master_timeout: z.string().optional(),
});

type ExistsTemplateParamsType = z.infer<typeof ExistsTemplateParams>;

export const registerExistsTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_exists_template",
    "Check existence of legacy index templates in Elasticsearch. Best for legacy template validation, migration planning, compatibility checks. Use when you need to verify legacy index template presence in Elasticsearch (deprecated, use composable templates instead).",
    {
      name: z.union([z.string(), z.array(z.string())]),
      flat_settings: booleanField().optional(),
      local: booleanField().optional(),
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
