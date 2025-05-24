import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerFlushIndexTool(server, esClient) {
  server.tool(
    "flush_index",
    "Flush an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
      force: z.boolean().optional(),
      waitIfOngoing: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.flush({
          index: params.index,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          force: params.force,
          wait_if_ongoing: params.waitIfOngoing,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to flush index:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 