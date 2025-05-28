/* src/tools/watcher/stop.ts */

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
const StopWatcherParams = z.object({
  master_timeout: z.string().optional(),
});

type StopWatcherParamsType = z.infer<typeof StopWatcherParams>;

export const registerWatcherStopTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const stopWatcherImpl = async (
    params: StopWatcherParamsType,
    extra: Record<string, unknown>,
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
    "watcher_stop",
    "Stop the watch service. Stop the Watcher service if it is running.",
    {
      master_timeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "watcher_stop",
      stopWatcherImpl,
      OperationType.DESTRUCTIVE,
    ),
  );
};
