/* src/tools/watcher/get_settings.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const getWatcherSettingsSchema = {
  type: "object",
  properties: {
    masterTimeout: {
      type: "string",
      description: "Explicit operation timeout for connection to master node",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const getWatcherSettingsValidator = z.object({
  masterTimeout: z.string().optional(),
});

type GetWatcherSettingsParams = z.infer<typeof getWatcherSettingsValidator>;

// MCP error handling
function createGetWatcherSettingsMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_get_settings] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherGetSettingsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getWatcherSettingsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = getWatcherSettingsValidator.parse(args);

      const result = await esClient.watcher.getSettings({
        master_timeout: params.masterTimeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow watcher operation", { duration });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createGetWatcherSettingsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createGetWatcherSettingsMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_watcher_get_settings",
    "Get Elasticsearch Watcher index settings for .watches index. Best for configuration review, troubleshooting, system analysis. Use when you need to inspect Watcher internal index settings in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",
    getWatcherSettingsSchema,
    withReadOnlyCheck("elasticsearch_watcher_get_settings", getWatcherSettingsHandler, OperationType.READ),
  );
};
