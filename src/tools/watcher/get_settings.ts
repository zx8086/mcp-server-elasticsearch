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
    "watcher_get_settings",
    "Get Watcher index settings. Get settings for the Watcher internal index (.watches). Only a subset of settings are shown, for example index.auto_expand_replicas and index.number_of_replicas.",
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
