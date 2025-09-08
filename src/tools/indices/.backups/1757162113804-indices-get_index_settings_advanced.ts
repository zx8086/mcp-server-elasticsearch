/* src/tools/indices/get_index_settings_advanced.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const getIndexSettingsAdvancedSchema = {
  type: "object",
  properties: {
    index: {
      oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
      description: "Index name(s) or pattern(s) to get settings for. Examples: 'logs-*', ['users', 'products']",
    },
    name: {
      oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
      description: "Setting name(s) to retrieve. If not specified, all settings are returned",
    },
    allowNoIndices: {
      type: "boolean",
      description: "Whether to ignore if a wildcard indices expression resolves into no concrete indices",
    },
    expandWildcards: {
      oneOf: [
        { type: "string", enum: ["all", "open", "closed", "hidden", "none"] },
        { type: "array", items: { type: "string", enum: ["all", "open", "closed", "hidden", "none"] } },
      ],
      description: "Type of index that wildcard patterns can match",
    },
    flatSettings: {
      type: "boolean",
      description: "Return settings in flat format",
    },
    ignoreUnavailable: {
      type: "boolean",
      description: "Whether specified concrete indices should be ignored when unavailable",
    },
    includeDefaults: {
      type: "boolean",
      description: "Whether to return default values in the response",
    },
    local: {
      type: "boolean",
      description: "Return local information, do not retrieve the state from master node",
    },
    masterTimeout: {
      type: "string",
      description: "Timeout for connection to master node",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const getIndexSettingsAdvancedValidator = z.object({
  index: z.union([z.string(), z.array(z.string())]).optional(),
  name: z.union([z.string(), z.array(z.string())]).optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .or(z.array(z.enum(["all", "open", "closed", "hidden", "none"])))
    .optional(),
  flatSettings: booleanField().optional(),
  ignoreUnavailable: booleanField().optional(),
  includeDefaults: booleanField().optional(),
  local: booleanField().optional(),
  masterTimeout: z.string().optional(),
});

type GetIndexSettingsAdvancedParams = z.infer<typeof getIndexSettingsAdvancedValidator>;

// MCP error handling
function createGetIndexSettingsAdvancedMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "index_not_found" | "setting_not_found" | "timeout";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    setting_not_found: ErrorCode.InvalidParams,
    timeout: ErrorCode.InternalError,
  };

  return new McpError(
    errorCodeMap[context.type],
    `[elasticsearch_get_index_settings_advanced] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerGetIndexSettingsAdvancedTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getIndexSettingsAdvancedHandler = async (args: any): Promise<SearchResult> => {
    try {
      // Validate parameters
      const params = getIndexSettingsAdvancedValidator.parse(args);

      logger.debug("Getting advanced index settings", {
        index: params.index,
        name: params.name,
      });

      const result = await esClient.indices.getSettings(
        {
          index: params.index,
          name: params.name,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flat_settings: params.flatSettings,
          ignore_unavailable: params.ignoreUnavailable,
          include_defaults: params.includeDefaults,
          local: params.local,
          master_timeout: params.masterTimeout,
        },
        {
          opaqueId: "elasticsearch_get_index_settings_advanced",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createGetIndexSettingsAdvancedMcpError(
          `Validation failed: ${error.errors.map((e) => e.message).join(", ")}`,
          {
            type: "validation",
            details: { validationErrors: error.errors, providedArgs: args },
          },
        );
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          throw createGetIndexSettingsAdvancedMcpError(`Index not found: ${args?.index}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("setting_not_found") || error.message.includes("unknown setting")) {
          throw createGetIndexSettingsAdvancedMcpError(`Setting not found: ${args?.name}`, {
            type: "setting_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("timeout") || error.message.includes("timed_out")) {
          throw createGetIndexSettingsAdvancedMcpError(`Operation timed out: ${error.message}`, {
            type: "timeout",
            details: { originalError: error.message },
          });
        }
      }

      throw createGetIndexSettingsAdvancedMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: { args },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_get_index_settings_advanced",

    {

      title: "Get Index Settings Advanced",

      description: "Get comprehensive index settings from Elasticsearch with advanced options. Best for configuration analysis, performance tuning, troubleshooting. Use when you need detailed index settings including data stream backing indices in Elasticsearch.",

      inputSchema: getIndexSettingsAdvancedSchema,

    },

    getIndexSettingsAdvancedHandler,

  );
};
