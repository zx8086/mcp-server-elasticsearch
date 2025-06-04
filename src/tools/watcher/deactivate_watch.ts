/* src/tools/watcher/deactivate_watch.ts */

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
const DeactivateWatchParams = z.object({
  watch_id: z.string().min(1, "Watch ID is required"),
});

type DeactivateWatchParamsType = z.infer<typeof DeactivateWatchParams>;

export const registerWatcherDeactivateWatchTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const deactivateWatchImpl = async (
    params: DeactivateWatchParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.watcher.deactivateWatch({
        watch_id: params.watch_id,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to deactivate watch:", {
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
    "elasticsearch_watcher_deactivate_watch",
    "Deactivate a watch in Elasticsearch Watcher. Best for: monitoring control, alerting management, watch lifecycle control. Use when you need to disable watch execution while preserving the watch definition in Elasticsearch.",
    {
      watch_id: z.string().min(1, "Watch ID is required"),
    },
    withReadOnlyCheck(
      "elasticsearch_watcher_deactivate_watch",
      deactivateWatchImpl,
      OperationType.WRITE,
    ),
  );
};
