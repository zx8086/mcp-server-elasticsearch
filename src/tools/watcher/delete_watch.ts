/* src/tools/watcher/delete_watch.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
} from "../types.js";

// Define the parameter schema
const DeleteWatchParams = z.object({
  id: z.string().min(1, "Watch ID is required"),
});

type DeleteWatchParamsType = z.infer<typeof DeleteWatchParams>;

export const registerWatcherDeleteWatchTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const deleteWatchImpl = async (
    params: DeleteWatchParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.watcher.deleteWatch({
        id: params.id,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to delete watch:", {
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
  };

  server.tool(
    "elasticsearch_watcher_delete_watch",
    "Delete a watch from Elasticsearch Watcher. Best for watch cleanup, configuration management, removing unused monitors. Use when you need to permanently remove watch definitions from Elasticsearch alerting system. IMPORTANT: Use only this API, not direct index deletion.",
    {
      id: z.string().min(1, "Watch ID is required"),
    },
    withReadOnlyCheck(
      "elasticsearch_watcher_delete_watch",
      deleteWatchImpl,
      OperationType.DELETE,
    ),
  );
};
