/* src/tools/watcher/query_watches.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const QueryWatchesParams = z.object({
  from: z.number().min(0).optional(),
  size: z.number().min(1).max(50).optional(),
  query: z.record(z.any()).optional(),
  sort: z.union([
    z.string(),
    z.record(z.any()),
    z.array(z.union([z.string(), z.record(z.any())]))
  ]).optional(),
  search_after: z.array(z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
});

type QueryWatchesParamsType = z.infer<typeof QueryWatchesParams>;

export const registerWatcherQueryWatchesTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "watcher_query_watches",
    "Query watches. Get all registered watches in a paginated manner and optionally filter watches by a query. Note that only the _id and metadata.* fields are queryable or sortable.",
    {
      from: z.number().min(0).optional(),
      size: z.number().min(1).max(50).optional(),
      query: z.record(z.any()).optional(),
      sort: z.union([
        z.string(),
        z.record(z.any()),
        z.array(z.union([z.string(), z.record(z.any())]))
      ]).optional(),
      search_after: z.array(z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
    },
    async (params: QueryWatchesParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.watcher.queryWatches({
          from: params.from,
          size: params.size,
          query: params.query,
          sort: params.sort,
          search_after: params.search_after,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to query watches:", {
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
