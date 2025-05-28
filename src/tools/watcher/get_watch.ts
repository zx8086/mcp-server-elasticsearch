/* src/tools/watcher/get_watch.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const GetWatchParams = z.object({
  id: z.string().min(1, "Watch ID is required"),
});

type GetWatchParamsType = z.infer<typeof GetWatchParams>;

export const registerWatcherGetWatchTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "watcher_get_watch",
    "Get a watch configuration from Elasticsearch Watcher",
    {
      id: z.string().min(1, "Watch ID is required"),
    },
    async (params: GetWatchParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.watcher.getWatch({
          id: params.id,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get watch:", {
          error: error instanceof Error ? error.message : String(error),
          watchId: params.id,
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
