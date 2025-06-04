/* src/tools/index_management/put_mapping.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const PutMappingParams = z.object({
  index: z.string().min(1, "Index is required"),
  properties: z.record(z.any()).optional(),
  runtime: z.record(z.any()).optional(),
  meta: z.record(z.any()).optional(),
  dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(),
  dateDetection: z.boolean().optional(),
  dynamicDateFormats: z.array(z.string()).optional(),
  dynamicTemplates: z.array(z.record(z.any())).optional(),
  numericDetection: z.boolean().optional(),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  writeIndexOnly: z.boolean().optional(),
});

type PutMappingParamsType = z.infer<typeof PutMappingParams>;
export const registerPutMappingTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_put_mapping",
    "Update index mappings in Elasticsearch. Best for: schema evolution, field addition, mapping modifications. Use when you need to add new fields or update existing field mappings in Elasticsearch indices.",
    {
      index: z.string().min(1, "Index is required"),
      properties: z.record(z.any()).optional(),
      runtime: z.record(z.any()).optional(),
      meta: z.record(z.any()).optional(),
      dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(),
      dateDetection: z.boolean().optional(),
      dynamicDateFormats: z.array(z.string()).optional(),
      dynamicTemplates: z.array(z.record(z.any())).optional(),
      numericDetection: z.boolean().optional(),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
      writeIndexOnly: z.boolean().optional(),
    },
    async (params: PutMappingParamsType): Promise<SearchResult> => {
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
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to update index mapping:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            } as TextContent,
          ],
        };
      }
    },
  );
};
