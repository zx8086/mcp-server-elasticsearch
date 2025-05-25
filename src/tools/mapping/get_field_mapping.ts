/* src/tools/mapping/get_field_mapping.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetFieldMappingTool(server, esClient) {
  server.tool(
    "get_field_mapping",
    "Get field mapping for a specific field in an index",
    {
      index: z.string().min(1, "Index is required"),
      field: z.string().min(1, "Field name is required"),
      includeDefaults: z.boolean().optional(),
      local: z.boolean().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.getFieldMapping({
          index: params.index,
          fields: params.field,
          include_defaults: params.includeDefaults,
          local: params.local,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get field mapping:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 