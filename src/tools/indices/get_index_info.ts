/* src/tools/indices/get_index_info.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

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
    "elasticsearch_get_index_info",
    "Get comprehensive index information from Elasticsearch including aliases, mappings, and settings. Best for index inspection, configuration analysis, data stream monitoring. Use when you need detailed metadata about Elasticsearch indices with feature filtering capabilities for selective information retrieval.",
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
