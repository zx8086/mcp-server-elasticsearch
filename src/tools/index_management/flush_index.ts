/* src/tools/index_management/flush_index.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const FlushIndexParams = z.object({
  index: z.string().min(1, "Index is required"),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .optional(),
  force: z.boolean().optional(),
  waitIfOngoing: z.boolean().optional(),
});

type FlushIndexParamsType = z.infer<typeof FlushIndexParams>;
export const registerFlushIndexTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "flush_index",
    "Flush an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
      force: z.boolean().optional(),
      waitIfOngoing: z.boolean().optional(),
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
