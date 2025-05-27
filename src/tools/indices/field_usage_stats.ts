/* src/tools/indices/field_usage_stats.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const FieldUsageStatsParams = z.object({
  index: z.union([z.string(), z.array(z.string())]),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).or(z.array(z.enum(["all", "open", "closed", "hidden", "none"]))).optional(),
  ignoreUnavailable: z.boolean().optional(),
  fields: z.union([z.string(), z.array(z.string())]).optional(),
});

type FieldUsageStatsParamsType = z.infer<typeof FieldUsageStatsParams>;

export const registerFieldUsageStatsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "field_usage_stats",
    "Get field usage stats. Get field usage information for each shard and field of an index. Field usage statistics are automatically captured when queries are running on a cluster. A shard-level search request that accesses a given field, even if multiple times during that request, is counted as a single use.",
    {
      index: z.union([z.string(), z.array(z.string())]),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).or(z.array(z.enum(["all", "open", "closed", "hidden", "none"]))).optional(),
      ignoreUnavailable: z.boolean().optional(),
      fields: z.union([z.string(), z.array(z.string())]).optional(),
    },
    async (params: FieldUsageStatsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.fieldUsageStats({
          index: params.index,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          ignore_unavailable: params.ignoreUnavailable,
          fields: params.fields,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get field usage stats:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
};
