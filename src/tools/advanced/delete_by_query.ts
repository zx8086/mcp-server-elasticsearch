/* src/tools/advanced/delete_by_query.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
  WaitForActiveShards,
} from "../types.js";

// Define the parameter schema
const DeleteByQueryParams = z.object({
  index: z.string().min(1, "Index is required"),
  query: z.record(z.any()),
  maxDocs: z.number().optional(),
  conflicts: z.enum(["abort", "proceed"]).optional(),
  refresh: z.boolean().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.custom<WaitForActiveShards>().optional(),
  waitForCompletion: z.boolean().optional(),
  requestsPerSecond: z.number().optional(),
  scroll: z.string().optional(),
  scrollSize: z.number().optional(),
  searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
  searchTimeout: z.string().optional(),
  slices: z.number().optional(),
});

type DeleteByQueryParamsType = z.infer<typeof DeleteByQueryParams>;

export const registerDeleteByQueryTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const deleteByQueryImpl = async (
    params: DeleteByQueryParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.deleteByQuery({
        index: params.index,
        query: params.query,
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
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to delete by query:", {
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
  };

  server.tool(
    "elasticsearch_delete_by_query",
    "Delete documents by query in Elasticsearch. Best for bulk document deletion, data cleanup, removing documents matching specific criteria. Use when you need to delete multiple documents based on query conditions rather than individual document IDs in Elasticsearch.",
    {
      index: z.string().min(1, "Index is required"),
      query: z.record(z.any()),
      maxDocs: z.number().optional(),
      conflicts: z.enum(["abort", "proceed"]).optional(),
      refresh: z.boolean().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.custom<WaitForActiveShards>().optional(),
      waitForCompletion: z.boolean().optional(),
      requestsPerSecond: z.number().optional(),
      scroll: z.string().optional(),
      scrollSize: z.number().optional(),
      searchType: z
        .enum(["query_then_fetch", "dfs_query_then_fetch"])
        .optional(),
      searchTimeout: z.string().optional(),
      slices: z.number().optional(),
    },
    withReadOnlyCheck(
      "elasticsearch_delete_by_query",
      deleteByQueryImpl,
      OperationType.DELETE,
    ),
  );
};
