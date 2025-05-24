import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerDeleteIndexTool(server, esClient) {
  server.tool(
    "delete_index",
    "Delete an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.delete({
          index: params.index,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to delete index:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 