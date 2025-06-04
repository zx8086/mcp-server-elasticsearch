/* src/tools/watcher/start.ts */

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
const StartWatcherParams = z.object({
  master_timeout: z.string().optional(),
});

type StartWatcherParamsType = z.infer<typeof StartWatcherParams>;

export const registerWatcherStartTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const startWatcherImpl = async (
    params: StartWatcherParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.watcher.start({
        master_timeout: params.master_timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to start watcher service:", {
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
    "elasticsearch_watcher_start",
    "Start the Elasticsearch Watcher service. Best for: service management, monitoring activation, system initialization. Use when you need to enable the Watcher service for Elasticsearch alerting and monitoring capabilities.",
    {
      master_timeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "elasticsearch_watcher_start",
      startWatcherImpl,
      OperationType.WRITE,
    ),
  );
};
