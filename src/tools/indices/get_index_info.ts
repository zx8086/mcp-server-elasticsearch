/* src/tools/indices/get_index_info.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const GetIndexInfoParams = z.object({
  index: z.union([z.string(), z.array(z.string())]),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).or(z.array(z.enum(["all", "open", "closed", "hidden", "none"]))).optional(),
  flatSettings: z.boolean().optional(),
  ignoreUnavailable: z.boolean().optional(),
  includeDefaults: z.boolean().optional(),
  local: z.boolean().optional(),
  masterTimeout: z.string().optional(),
  features: z.enum(["aliases", "mappings", "settings"]).or(z.array(z.enum(["aliases", "mappings", "settings"]))).optional(),
});

type GetIndexInfoParamsType = z.infer<typeof GetIndexInfoParams>;

export const registerGetIndexInfoTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "get_index_info",
    "Get index information. Get information about one or more indices. For data streams, the API returns information about the stream's backing indices. This enhanced version supports feature filtering.",
    {
      index: z.union([z.string(), z.array(z.string())]),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).or(z.array(z.enum(["all", "open", "closed", "hidden", "none"]))).optional(),
      flatSettings: z.boolean().optional(),
      ignoreUnavailable: z.boolean().optional(),
      includeDefaults: z.boolean().optional(),
      local: z.boolean().optional(),
      masterTimeout: z.string().optional(),
      features: z.enum(["aliases", "mappings", "settings"]).or(z.array(z.enum(["aliases", "mappings", "settings"]))).optional(),
    },
    async (params: GetIndexInfoParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.get({
          index: params.index,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flat_settings: params.flatSettings,
          ignore_unavailable: params.ignoreUnavailable,
          include_defaults: params.includeDefaults,
          local: params.local,
          master_timeout: params.masterTimeout,
          features: params.features,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get index information:", {
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
