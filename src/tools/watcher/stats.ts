/* src/tools/watcher/stats.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const WatcherStatsParams = z.object({
  metric: z.union([
    z.enum(["_all", "queued_watches", "current_watches", "pending_watches"]),
    z.array(z.enum(["_all", "queued_watches", "current_watches", "pending_watches"]))
  ]).optional(),
  emit_stacktraces: z.boolean().optional(),
});

type WatcherStatsParamsType = z.infer<typeof WatcherStatsParams>;

export const registerWatcherStatsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_watcher_stats",
    "Get Elasticsearch Watcher statistics and metrics. Best for performance monitoring, service analysis, execution tracking. Use when you need to monitor Watcher service performance and execution statistics in Elasticsearch.",
    {
      metric: z.union([
        z.enum(["_all", "queued_watches", "current_watches", "pending_watches"]),
        z.array(z.enum(["_all", "queued_watches", "current_watches", "pending_watches"]))
      ]).optional(),
      emit_stacktraces: z.boolean().optional(),
    },
    async (params: WatcherStatsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.watcher.stats({
          metric: params.metric,
          emit_stacktraces: params.emit_stacktraces,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get watcher stats:", {
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
