/* src/tools/search/update_by_query.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const UpdateByQueryParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  query: z.object({}).passthrough(),
  script: z.object({}).passthrough().optional(),
  maxDocs: z.number().optional(),
  conflicts: z.enum(["abort", "proceed"]).optional(),
  refresh: booleanField().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
  waitForCompletion: booleanField().optional(),
  requestsPerSecond: z.number().optional(),
  scroll: z.string().optional(),
  scrollSize: z.number().optional(),
  searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
  searchTimeout: z.string().optional(),
  slices: z.number().optional(),
});

type UpdateByQueryParamsType = z.infer<typeof UpdateByQueryParams>;
export const registerUpdateByQueryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_update_by_query",
    "Update documents by query in Elasticsearch. Best for bulk document updates, field modifications, script-based transformations. Use when you need to update multiple documents based on query conditions rather than individual document updates.",
    {
      index: z.string().min(1, "Index cannot be empty"),
      query: z.object({}).passthrough(),
      script: z.object({}).passthrough().optional(),
      maxDocs: z.number().optional(),
      conflicts: z.enum(["abort", "proceed"]).optional(),
      refresh: booleanField().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
      waitForCompletion: booleanField().optional(),
      requestsPerSecond: z.number().optional(),
      scroll: z.string().optional(),
      scrollSize: z.number().optional(),
      searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
      searchTimeout: z.string().optional(),
      slices: z.number().optional(),
    },
    async (params: UpdateByQueryParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.updateByQuery(
          {
            index: params.index,
            query: params.query,
            script: params.script,
            max_docs: params.maxDocs,
            conflicts: params.conflicts,
            refresh: params.refresh,
            timeout: params.timeout,
            wait_for_active_shards: params.waitForActiveShards,
            wait_for_completion: params.waitForCompletion,
            requests_per_second: params.requestsPerSecond,
            scroll: params.scroll,
            scroll_size: params.scrollSize,
            search_type: params.searchType,
            search_timeout: params.searchTimeout,
            slices: params.slices,
          },
          {
            opaqueId: "elasticsearch_update_by_query",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to update by query:", {
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
