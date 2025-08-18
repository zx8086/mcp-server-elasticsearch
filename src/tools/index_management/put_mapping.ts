/* src/tools/index_management/put_mapping.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const PutMappingParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  properties: z.object({}).passthrough().optional(),
  runtime: z.object({}).passthrough().optional(),
  meta: z.object({}).passthrough().optional(),
  dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(),
  dateDetection: booleanField().optional(),
  dynamicDateFormats: z.array(z.string()).optional(),
  dynamicTemplates: z.array(z.object({}).passthrough()).optional(),
  numericDetection: booleanField().optional(),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  ignoreUnavailable: booleanField().optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  writeIndexOnly: booleanField().optional(),
});

type PutMappingParamsType = z.infer<typeof PutMappingParams>;
export const registerPutMappingTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_put_mapping",
    "Update index mappings in Elasticsearch. Best for schema evolution, field addition, mapping modifications. Use when you need to add new fields or update existing field mappings in Elasticsearch indices.",
    {
      index: z.string().min(1, "Index cannot be empty"),
      properties: z.object({}).passthrough().optional(),
      runtime: z.object({}).passthrough().optional(),
      meta: z.object({}).passthrough().optional(),
      dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(),
      dateDetection: booleanField().optional(),
      dynamicDateFormats: z.array(z.string()).optional(),
      dynamicTemplates: z.array(z.object({}).passthrough()).optional(),
      numericDetection: booleanField().optional(),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      ignoreUnavailable: booleanField().optional(),
      allowNoIndices: booleanField().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
      writeIndexOnly: booleanField().optional(),
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
