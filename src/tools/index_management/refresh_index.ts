/* src/tools/index_management/refresh_index.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const RefreshIndexParams = z.object({
  index: z.string().min(1, "Index is required"),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
});

type RefreshIndexParamsType = z.infer<typeof RefreshIndexParams>;
export const registerRefreshIndexTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_refresh_index",
    "Refresh an index in Elasticsearch. Best for: data visibility, search consistency, real-time operations. Use when you need to make recently indexed documents immediately searchable in Elasticsearch.",
    {
      index: z.string().min(1, "Index is required"),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
    },
    async (params: RefreshIndexParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.refresh({
          index: params.index,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to refresh index:", {
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
