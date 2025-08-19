/* src/tools/index_management/get_index.ts */ import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "./types.js"; // Define the parameter schema type
const GetIndexParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  ignoreUnavailable: booleanField().optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  flatSettings: booleanField().optional(),
  includeDefaults: booleanField().optional(),
  local: booleanField().optional(),
  masterTimeout: z.string().optional(),
});
type GetIndexParamsType = z.infer<typeof GetIndexParams>;
export const registerGetIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_get_index",
    "Get comprehensive index information from Elasticsearch including settings, mappings, and aliases. Best for index inspection, configuration analysis, troubleshooting. Empty {} parameters will default to getting information for all indices. Use when you need detailed metadata about Elasticsearch indices structure and configuration. Parameters have smart defaults: index='*', ignoreUnavailable=true, allowNoIndices=true.",
    {
      index: z
        .string()
        .min(1, "Index is required")
        .describe("Index pattern to get information for. Use '*' for all indices. Supports wildcards."),
      ignoreUnavailable: booleanField().optional().describe("Ignore unavailable indices "),
      allowNoIndices: booleanField().optional().describe("Allow wildcards that match no indices "),
      expandWildcards: z
        .enum(["all", "open", "closed", "hidden", "none"])
        .optional()
        .describe("Which indices to expand wildcards to: 'all', 'open', 'closed', 'hidden', or 'none'"),
      flatSettings: booleanField().optional().describe("Return settings in flat format "),
      includeDefaults: booleanField().optional().describe("Include default settings "),
      local: booleanField().optional().describe("Return local information only "),
      masterTimeout: z.string().optional().describe("Timeout for connection to master node"),
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent] };
      } catch (error) {
        logger.error("Failed to get index information:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` } as TextContent,
          ],
        };
      }
    },
  );
};
