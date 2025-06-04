/* src/tools/watcher/update_settings.ts */

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
const UpdateWatcherSettingsParams = z.object({
  "index.auto_expand_replicas": z.string().optional(),
  "index.number_of_replicas": z.number().optional(),
  master_timeout: z.string().optional(),
  timeout: z.string().optional(),
});

type UpdateWatcherSettingsParamsType = z.infer<typeof UpdateWatcherSettingsParams>;

export const registerWatcherUpdateSettingsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const updateWatcherSettingsImpl = async (
    params: UpdateWatcherSettingsParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.watcher.updateSettings({
        "index.auto_expand_replicas": params["index.auto_expand_replicas"],
        "index.number_of_replicas": params["index.number_of_replicas"],
        master_timeout: params.master_timeout,
        timeout: params.timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to update watcher settings:", {
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
    "elasticsearch_watcher_update_settings",
    "Update Elasticsearch Watcher index settings for .watches index. Best for: configuration management, performance tuning, allocation control. Use when you need to modify Watcher internal index settings like replicas and allocation in Elasticsearch.",
    {
      "index.auto_expand_replicas": z.string().optional(),
      "index.number_of_replicas": z.number().optional(),
      master_timeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "elasticsearch_watcher_update_settings",
      updateWatcherSettingsImpl,
      OperationType.WRITE,
    ),
  );
};
