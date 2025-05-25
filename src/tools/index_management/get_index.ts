/* src/tools/index_management/get_index.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetIndexTool(server, esClient) {
  server.tool(
    "get_index",
    "Get index information from Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
      flatSettings: z.boolean().optional(),
      includeDefaults: z.boolean().optional(),
      local: z.boolean().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params) => {
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get index information:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 