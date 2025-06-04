/* src/tools/watcher/activate_watch.ts */

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
const ActivateWatchParams = z.object({
  watch_id: z.string().min(1, "Watch ID is required"),
});

type ActivateWatchParamsType = z.infer<typeof ActivateWatchParams>;

export const registerWatcherActivateWatchTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const activateWatchImpl = async (
    params: ActivateWatchParamsType,
    extra: Record<string, unknown>,
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
    "Activate a watch in Elasticsearch Watcher. Best for: monitoring automation, alerting management, watch lifecycle control. Use when you need to enable watch execution for Elasticsearch alerting and monitoring workflows.",
    {
      watch_id: z.string().min(1, "Watch ID is required"),
    },
    withReadOnlyCheck(
      "elasticsearch_watcher_activate_watch",
      activateWatchImpl,
      OperationType.WRITE,
    ),
  );
};
