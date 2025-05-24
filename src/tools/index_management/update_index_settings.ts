import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerUpdateIndexSettingsTool(server, esClient) {
  server.tool(
    "update_index_settings",
    "Update index settings in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      settings: z.record(z.any()),
      preserveExisting: z.boolean().optional(),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
      flatSettings: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.putSettings({
          index: params.index,
          settings: params.settings,
          preserve_existing: params.preserveExisting,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flat_settings: params.flatSettings,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to update index settings:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 