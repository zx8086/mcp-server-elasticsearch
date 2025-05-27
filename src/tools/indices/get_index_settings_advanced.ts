/* src/tools/indices/get_index_settings_advanced.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const GetIndexSettingsAdvancedParams = z.object({
  index: z.union([z.string(), z.array(z.string())]).optional(),
  name: z.union([z.string(), z.array(z.string())]).optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).or(z.array(z.enum(["all", "open", "closed", "hidden", "none"]))).optional(),
  flatSettings: z.boolean().optional(),
  ignoreUnavailable: z.boolean().optional(),
  includeDefaults: z.boolean().optional(),
  local: z.boolean().optional(),
  masterTimeout: z.string().optional(),
});

type GetIndexSettingsAdvancedParamsType = z.infer<typeof GetIndexSettingsAdvancedParams>;

export const registerGetIndexSettingsAdvancedTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "get_index_settings_advanced",
    "Get index settings. Get setting information for one or more indices. For data streams, it returns setting information for the stream's backing indices. This enhanced version provides more comprehensive settings retrieval with advanced options.",
    {
      index: z.union([z.string(), z.array(z.string())]).optional(),
      name: z.union([z.string(), z.array(z.string())]).optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).or(z.array(z.enum(["all", "open", "closed", "hidden", "none"]))).optional(),
      flatSettings: z.boolean().optional(),
      ignoreUnavailable: z.boolean().optional(),
      includeDefaults: z.boolean().optional(),
      local: z.boolean().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params: GetIndexSettingsAdvancedParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.getSettings({
          index: params.index,
          name: params.name,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flat_settings: params.flatSettings,
          ignore_unavailable: params.ignoreUnavailable,
          include_defaults: params.includeDefaults,
          local: params.local,
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get advanced index settings:", {
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
