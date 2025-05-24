import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerPutMappingTool(server, esClient) {
  server.tool(
    "put_mapping",
    "Update index mappings in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      properties: z.record(z.any()).optional(),
      runtime: z.record(z.any()).optional(),
      meta: z.record(z.any()).optional(),
      dynamic: z.string().optional(),
      dateDetection: z.boolean().optional(),
      dynamicDateFormats: z.array(z.string()).optional(),
      dynamicTemplates: z.array(z.record(z.any())).optional(),
      numericDetection: z.boolean().optional(),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
      writeIndexOnly: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.putMapping({
          index: params.index,
          properties: params.properties,
          runtime: params.runtime,
          _meta: params.meta,
          dynamic: params.dynamic,
          date_detection: params.dateDetection,
          dynamic_date_formats: params.dynamicDateFormats,
          dynamic_templates: params.dynamicTemplates,
          numeric_detection: params.numericDetection,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          write_index_only: params.writeIndexOnly,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to update index mapping:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 