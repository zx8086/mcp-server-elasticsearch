/* src/tools/index_management/update_index_settings.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const UpdateIndexSettingsParams = z.object({
  index: z.string().min(1, "Index is required"),
  settings: z.record(z.any()),
  preserveExisting: z.boolean().optional(),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  flatSettings: z.boolean().optional(),
});

type UpdateIndexSettingsParamsType = z.infer<typeof UpdateIndexSettingsParams>;
export const registerUpdateIndexSettingsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_update_index_settings",
    "Update index settings in Elasticsearch. Best for: performance tuning, configuration changes, index optimization. Use when you need to modify index settings for better performance or functionality in Elasticsearch.",
    {
      index: z.string().min(1, "Index is required"),
      settings: z.record(z.any()),
      preserveExisting: z.boolean().optional(),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
      flatSettings: z.boolean().optional(),
    },
    async (params: UpdateIndexSettingsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.putSettings(
          {
            index: params.index,
            settings: params.settings,
            preserve_existing: params.preserveExisting,
            timeout: params.timeout,
            master_timeout: params.masterTimeout,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards,
            flat_settings: params.flatSettings,
          },
          {
            opaqueId: "elasticsearch_update_index_settings",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to update index settings:", {
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
