import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerDeleteByQueryTool(server, esClient) {
  server.tool(
    "delete_by_query",
    "Delete documents by query in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      query: z.record(z.any()),
      maxDocs: z.number().optional(),
      conflicts: z.string().optional(),
      refresh: z.boolean().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.string().optional(),
      waitForCompletion: z.boolean().optional(),
      requestsPerSecond: z.number().optional(),
      scroll: z.string().optional(),
      scrollSize: z.number().optional(),
      searchType: z.string().optional(),
      searchTimeout: z.string().optional(),
      slices: z.number().optional(),
    },
    async (params) => {
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to delete by query:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 