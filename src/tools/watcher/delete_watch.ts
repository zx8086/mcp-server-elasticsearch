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
    "watcher_delete_watch",
    "Delete a watch. When the watch is removed, the document representing the watch in the .watches index is gone and it will never be run again. IMPORTANT: Deleting a watch must be done by using only this API. Do not delete the watch directly from the .watches index using the Elasticsearch delete document API.",
    {
      id: z.string().min(1, "Watch ID is required"),
    },
    withReadOnlyCheck(
      "watcher_delete_watch",
      deleteWatchImpl,
      OperationType.DELETE,
    ),
  );
};
