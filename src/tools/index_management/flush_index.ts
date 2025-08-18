/* src/tools/index_management/flush_index.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const FlushIndexParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  ignoreUnavailable: booleanField().optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  force: booleanField().optional(),
  waitIfOngoing: booleanField().optional(),
});

type FlushIndexParamsType = z.infer<typeof FlushIndexParams>;
export const registerFlushIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_flush_index",
    "Flush an Elasticsearch index to ensure all data is written to disk. Best for data persistence, index optimization, ensuring durability. Use when you need to force Elasticsearch to write buffered data to storage for consistency.",
    {
      index: z.string().min(1, "Index cannot be empty"),
      ignoreUnavailable: booleanField().optional(),
      allowNoIndices: booleanField().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
      force: booleanField().optional(),
      waitIfOngoing: booleanField().optional(),
    },
    async (params: FlushIndexParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.flush({
          index: params.index,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          force: params.force,
          wait_if_ongoing: params.waitIfOngoing,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to flush index:", {
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
