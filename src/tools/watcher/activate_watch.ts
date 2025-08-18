/* src/tools/watcher/activate_watch.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const ActivateWatchParams = z.object({
  watch_id: z.string().min(1, "Watch ID cannot be empty"),
});

type ActivateWatchParamsType = z.infer<typeof ActivateWatchParams>;

export const registerWatcherActivateWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const activateWatchImpl = async (
    params: ActivateWatchParamsType,
    _extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.watcher.activateWatch({
        watch_id: params.watch_id,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to activate watch:", {
        error: error instanceof Error ? error.message : String(error),
        watchId: params.watch_id,
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
    "elasticsearch_watcher_activate_watch",
    "Activate a watch in Elasticsearch Watcher. Best for monitoring automation, alerting management, watch lifecycle control. Use when you need to enable watch execution for Elasticsearch alerting and monitoring workflows.",
    {
      watch_id: z.string().min(1, "Watch ID cannot be empty"),
    },
    withReadOnlyCheck("elasticsearch_watcher_activate_watch", activateWatchImpl, OperationType.WRITE),
  );
};
