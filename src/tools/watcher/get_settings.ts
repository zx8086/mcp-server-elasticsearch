/* src/tools/watcher/get_settings.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const GetWatcherSettingsParams = z.object({
  masterTimeout: z.string().optional(),
});

type GetWatcherSettingsParamsType = z.infer<typeof GetWatcherSettingsParams>;

export const registerWatcherGetSettingsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_watcher_get_settings",
    "Get Elasticsearch Watcher index settings for .watches index. Best for: configuration review, troubleshooting, system analysis. Use when you need to inspect Watcher internal index settings in Elasticsearch.",
    {
      masterTimeout: z.string().optional(),
    },
    async (params: GetWatcherSettingsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.watcher.getSettings({
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get watcher settings:", {
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
