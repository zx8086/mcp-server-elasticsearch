/* src/tools/mapping/get_field_mapping.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const GetFieldMappingParams = z.object({
  index: z.string().min(1, "Index is required"),
  field: z.string().min(1, "Field name is required"),
  includeDefaults: z.boolean().optional(),
  local: z.boolean().optional(),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
});

type GetFieldMappingParamsType = z.infer<typeof GetFieldMappingParams>;
export const registerGetFieldMappingTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
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
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
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
  );
};
