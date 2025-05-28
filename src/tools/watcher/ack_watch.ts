/* src/tools/watcher/ack_watch.ts */

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
const AckWatchParams = z.object({
  watch_id: z.string().min(1, "Watch ID is required"),
  action_id: z.union([z.string(), z.array(z.string())]).optional(),
});

type AckWatchParamsType = z.infer<typeof AckWatchParams>;

export const registerWatcherAckWatchTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const ackWatchImpl = async (
    params: AckWatchParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
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
    "watcher_ack_watch",
    "Acknowledge a watch. Acknowledging a watch enables you to manually throttle the execution of the watch's actions. IMPORTANT: If the specified watch is currently being executed, this API will return an error. Acknowledging an action throttles further executions of that action until its ack.state is reset to awaits_successful_execution.",
    {
      watch_id: z.string().min(1, "Watch ID is required"),
      action_id: z.union([z.string(), z.array(z.string())]).optional(),
    },
    withReadOnlyCheck(
      "watcher_ack_watch",
      ackWatchImpl,
      OperationType.WRITE,
    ),
  );
};
