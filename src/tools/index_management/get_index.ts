/* src/tools/index_management/get_index.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const GetIndexParams = z.object({
  index: z.string().min(1, "Index is required"),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .optional(),
  flatSettings: z.boolean().optional(),
  includeDefaults: z.boolean().optional(),
  local: z.boolean().optional(),
  masterTimeout: z.string().optional(),
});

type GetIndexParamsType = z.infer<typeof GetIndexParams>;
export const registerGetIndexTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_get_index",
    "Get comprehensive index information from Elasticsearch including settings, mappings, and aliases. Best for index inspection, configuration analysis, troubleshooting. Use when you need detailed metadata about Elasticsearch indices structure and configuration.",
    {
      index: z.string().min(1, "Index is required"),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
      flatSettings: z.boolean().optional(),
      includeDefaults: z.boolean().optional(),
      local: z.boolean().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params: GetIndexParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.get({
          index: params.index,
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
        logger.error("Failed to get index information:", {
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
