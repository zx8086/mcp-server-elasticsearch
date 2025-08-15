/* src/tools/watcher/stop.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const StopWatcherParams = z.object({
  master_timeout: z.string().optional(),
});

type StopWatcherParamsType = z.infer<typeof StopWatcherParams>;

export const registerWatcherStopTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const stopWatcherImpl = async (
    params: StopWatcherParamsType,
    _extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.watcher.stop({
        master_timeout: params.master_timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to stop watcher service:", {
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
  };

  server.tool(
    "elasticsearch_watcher_stop",
    "Stop the Elasticsearch Watcher service. Best for service management, monitoring deactivation, maintenance operations. Use when you need to disable the Watcher service for Elasticsearch maintenance or troubleshooting.",
    {
      master_timeout: z.string().optional(),
    },
    withReadOnlyCheck("elasticsearch_watcher_stop", stopWatcherImpl, OperationType.DESTRUCTIVE),
  );
};
