/* src/tools/index_management/refresh_index.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerRefreshIndexTool(server, esClient) {
  server.tool(
    "refresh_index",
    "Refresh an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.refresh({
          index: params.index,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to refresh index:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 