/* src/tools/watcher/ack_watch.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const AckWatchParams = z.object({
  watch_id: z.string().min(1, "Watch ID is required"),
  action_id: z.union([z.string(), z.array(z.string())]).optional(),
});

type AckWatchParamsType = z.infer<typeof AckWatchParams>;

export const registerWatcherAckWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const ackWatchImpl = async (params: AckWatchParamsType, _extra: Record<string, unknown>): Promise<SearchResult> => {
    try {
      const result = await esClient.watcher.ackWatch({
        watch_id: params.watch_id,
        action_id: params.action_id,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to acknowledge watch:", {
        error: error instanceof Error ? error.message : String(error),
        watchId: params.watch_id,
        actionId: params.action_id,
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
    "elasticsearch_watcher_ack_watch",
    "Acknowledge a watch in Elasticsearch Watcher to throttle actions. Best for alert management, action throttling, notification control. Use when you need to manually acknowledge watch actions to prevent repeated executions in Elasticsearch alerting.",
    {
      watch_id: z.string().min(1, "Watch ID is required"),
      action_id: z.union([z.string(), z.array(z.string())]).optional(),
    },
    withReadOnlyCheck("elasticsearch_watcher_ack_watch", ackWatchImpl, OperationType.WRITE),
  );
};
