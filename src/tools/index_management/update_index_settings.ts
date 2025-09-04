/* src/tools/index_management/update_index_settings.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { coerceBoolean } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const updateIndexSettingsSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "Name of the index to update settings for",
    },
    settings: {
      type: "object",
      additionalProperties: true,
      description: "Index settings to update",
    },
    preserveExisting: {
      type: "boolean",
      description: "Preserve existing settings that are not specified",
    },
    timeout: {
      type: "string",
      description: "Operation timeout (e.g., '30s')",
    },
    masterTimeout: {
      type: "string",
      description: "Master node timeout (e.g., '30s')",
    },
    ignoreUnavailable: {
      type: "boolean",
      description: "Ignore unavailable indices",
    },
    allowNoIndices: {
      type: "boolean",
      description: "Allow wildcards that match no indices",
    },
    expandWildcards: {
      type: "string",
      enum: ["all", "open", "closed", "hidden", "none"],
      description: "Which indices to expand wildcards to",
    },
    flatSettings: {
      type: "boolean",
      description: "Accept settings in flat format",
    },
  },
  required: ["index", "settings"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const updateIndexSettingsValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  settings: z.object({}).passthrough(),
  preserveExisting: coerceBoolean.optional(),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  ignoreUnavailable: coerceBoolean.optional(),
  allowNoIndices: coerceBoolean.optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  flatSettings: coerceBoolean.optional(),
});

type UpdateIndexSettingsParams = z.infer<typeof updateIndexSettingsValidator>;

// MCP error handling
function createUpdateIndexSettingsMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    resource_already_exists: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_update_index_settings] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerUpdateIndexSettingsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const updateIndexSettingsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = updateIndexSettingsValidator.parse(args);

      const result = await esClient.indices.putSettings(
        {
          index: params.index,
          settings: params.settings,
          preserve_existing: params.preserveExisting,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flat_settings: params.flatSettings,
        },
        {
          opaqueId: "elasticsearch_update_index_settings",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow index settings update operation", { duration, index: params.index });
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
        throw createUpdateIndexSettingsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle index not found error
      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createUpdateIndexSettingsMcpError(`Index not found: ${args.index}`, {
          type: "index_not_found",
          details: { index: args.index },
        });
      }

      // Handle invalid settings
      if (error instanceof Error && error.message.includes("illegal_argument_exception")) {
        throw createUpdateIndexSettingsMcpError(`Invalid settings: ${error.message}`, {
          type: "resource_already_exists",
          details: { index: args.index, settings: args.settings },
        });
      }

      throw createUpdateIndexSettingsMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_update_index_settings",
    "Update index settings in Elasticsearch. Best for performance tuning, configuration changes, index optimization. Use when you need to modify index settings for better performance or functionality in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",
    updateIndexSettingsSchema,
    withReadOnlyCheck("elasticsearch_update_index_settings", updateIndexSettingsHandler, OperationType.WRITE),
  );
};
