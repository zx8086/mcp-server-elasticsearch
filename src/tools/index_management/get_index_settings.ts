/* src/tools/index_management/get_index_settings.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const GetIndexSettingsParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  name: z.string().optional(),
  ignoreUnavailable: booleanField().optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  flatSettings: booleanField().optional(),
  includeDefaults: booleanField().optional(),
  local: booleanField().optional(),
  masterTimeout: z.string().optional(),
});

type GetIndexSettingsParamsType = z.infer<typeof GetIndexSettingsParams>;
export const registerGetIndexSettingsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_get_index_settings",
    "Get index settings from Elasticsearch. Best for configuration review, performance analysis, troubleshooting. Use when you need to inspect index-level settings and configurations in Elasticsearch.",
    {
      index: z.string().min(1, "Index cannot be empty"),
      name: z.string().optional(),
      ignoreUnavailable: booleanField().optional(),
      allowNoIndices: booleanField().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
      flatSettings: booleanField().optional(),
      includeDefaults: booleanField().optional(),
      local: booleanField().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params: GetIndexSettingsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.getSettings({
          index: params.index,
          name: params.name,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flat_settings: params.flatSettings,
          include_defaults: params.includeDefaults,
          local: params.local,
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to get index settings:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            } as TextContent,
          ],
        };
      }
    },
  );
};
