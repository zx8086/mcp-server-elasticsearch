/* src/tools/index_management/index_exists.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerIndexExistsTool(server, esClient) {
  server.tool(
    "index_exists",
    "Check if an index exists in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
      flatSettings: z.boolean().optional(),
      includeDefaults: z.boolean().optional(),
      local: z.boolean().optional(),
    },
    async (params) => {
      try {
        const exists = await esClient.indices.exists({
          index: params.index,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flat_settings: params.flatSettings,
          include_defaults: params.includeDefaults,
          local: params.local,
        });
        return { content: [{ type: "text", text: `Exists: ${exists}` }] };
      } catch (error) {
        logger.error("Failed to check if index exists:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 