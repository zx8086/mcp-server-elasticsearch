/* src/tools/mapping/get_field_mapping.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const GetFieldMappingParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  field: z.string().min(1, "Field name cannot be empty"),
  includeDefaults: booleanField().optional(),
  local: booleanField().optional(),
  ignoreUnavailable: booleanField().optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
});

type GetFieldMappingParamsType = z.infer<typeof GetFieldMappingParams>;
export const registerGetFieldMappingTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_get_field_mapping",

    {

      title: "Get Field Mapping",

      description: "Get field mapping for a specific field in an Elasticsearch index. Best for schema inspection, field analysis, mapping troubleshooting. Use when you need to examine how specific fields are mapped and analyzed in Elasticsearch indices for search optimization.",

      inputSchema: {
      index: z.string().min(1, "Index cannot be empty"),
      field: z.string().min(1, "Field name cannot be empty"),
      includeDefaults: booleanField().optional(),
      local: booleanField().optional(),
      ignoreUnavailable: booleanField().optional(),
      allowNoIndices: booleanField().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
    },

    },

    async (params: GetFieldMappingParamsType): Promise<SearchResult> => {
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
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to get field mapping:", {
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

  );;
};
