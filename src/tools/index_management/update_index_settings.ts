/* src/tools/index_management/update_index_settings.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { coerceBoolean } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

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

      // Log the settings being applied for debugging
      logger.debug("Updating index settings", {
        index: params.index,
        settings: JSON.stringify(params.settings, null, 2),
      });

      // Check if settings object is empty or contains only empty objects
      const hasValidSettings = (settings: any): boolean => {
        if (!settings || typeof settings !== 'object') return false;
        
        // Check for deeply nested empty objects
        const checkNested = (obj: any): boolean => {
          if (typeof obj !== 'object' || obj === null) return true;
          const keys = Object.keys(obj);
          if (keys.length === 0) return false;
          
          return keys.some(key => {
            const value = obj[key];
            if (typeof value === 'object' && value !== null) {
              return checkNested(value);
            }
            return true; // Primitive values are valid
          });
        };
        
        return checkNested(settings);
      };

      if (!hasValidSettings(params.settings)) {
        throw new Error("Settings object is empty or contains no valid settings to update");
      }

      // Filter out common read-only settings that cause validation errors
      const filterReadOnlySettings = (settings: any): any => {
        const readOnlyPrefixes = [
          'index.uuid',
          'index.version',
          'index.provided_name',
          'index.creation_date',
          'index.history',
          'index.verified_before_close',
        ];
        
        const filterObject = (obj: any): any => {
          if (typeof obj !== 'object' || obj === null) return obj;
          
          const filtered: any = {};
          for (const [key, value] of Object.entries(obj)) {
            const fullPath = key;
            const isReadOnly = readOnlyPrefixes.some(prefix => fullPath.startsWith(prefix));
            
            if (!isReadOnly) {
              if (typeof value === 'object' && value !== null) {
                const filteredValue = filterObject(value);
                if (Object.keys(filteredValue).length > 0) {
                  filtered[key] = filteredValue;
                }
              } else {
                filtered[key] = value;
              }
            } else {
              logger.debug(`Filtering out read-only setting: ${fullPath}`);
            }
          }
          return filtered;
        };
        
        return filterObject(settings);
      };

      const filteredSettings = filterReadOnlySettings(params.settings);
      
      if (!hasValidSettings(filteredSettings)) {
        throw new Error("All provided settings are read-only and cannot be updated");
      }

      const result = await esClient.indices.putSettings(
        {
          index: params.index,
          body: filteredSettings, // Use body parameter for settings
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

      // Handle validation errors (action_request_validation_exception)
      if (error instanceof Error && error.message.includes("action_request_validation_exception")) {
        let enhancedMessage = `Settings validation failed: ${error.message}`;
        
        if (error.message.includes("no settings to update")) {
          enhancedMessage += "\n\nPossible causes:\n" +
            "1. The settings object is empty or contains only read-only settings\n" +
            "2. The settings are nested incorrectly (try flattening: 'index.lifecycle.name' instead of nested objects)\n" +
            "3. Some settings may be read-only for data stream backing indices\n" +
            "\nFor ILM settings on data streams, consider using ILM policy tools instead.";
        }
        
        throw createUpdateIndexSettingsMcpError(enhancedMessage, {
          type: "validation",
          details: { 
            index: args.index, 
            settings: args.settings,
            isDataStream: (args.index as string).startsWith('.ds-'),
            suggestion: "Try using flat setting names like 'index.lifecycle.name' instead of nested objects"
          },
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
    {
      index: z.string(), // Name of the index to update settings for
      settings: z.object({}), // Index settings to update
      preserveExisting: z.boolean().optional(), // Preserve existing settings that are not specified
      timeout: z.string().optional(), // Operation timeout (e.g., '30s')
      masterTimeout: z.string().optional(), // Master node timeout (e.g., '30s')
      ignoreUnavailable: z.boolean().optional(), // Ignore unavailable indices
      allowNoIndices: z.boolean().optional(), // Allow wildcards that match no indices
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(), // Which indices to expand wildcards to
      flatSettings: z.boolean().optional(), // Accept settings in flat format
    },
    withReadOnlyCheck("elasticsearch_update_index_settings", updateIndexSettingsHandler, OperationType.WRITE),
  );
};
