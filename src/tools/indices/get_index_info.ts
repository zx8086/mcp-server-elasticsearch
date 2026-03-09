/* src/tools/indices/get_index_info.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const getIndexInfoValidator = z.object({
  index: z.union([z.string(), z.array(z.string())]),
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
  features: z
    .enum(["aliases", "mappings", "settings"])
    .or(z.array(z.enum(["aliases", "mappings", "settings"])))
    .optional(),
});

type _GetIndexInfoParams = z.infer<typeof getIndexInfoValidator>;

// MCP error handling
function createGetIndexInfoMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "index_not_found" | "timeout";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    timeout: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_get_index_info] ${message}`, context.details);
}

// Tool implementation
export const registerGetIndexInfoTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getIndexInfoHandler = async (args: any): Promise<SearchResult> => {
    try {
      // Validate parameters
      const params = getIndexInfoValidator.parse(args);

      logger.debug("Getting index information", {
        index: params.index,
        features: params.features,
      });

      const result = await esClient.indices.get(
        {
          index: params.index,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flat_settings: params.flatSettings,
          ignore_unavailable: params.ignoreUnavailable,
          include_defaults: params.includeDefaults,
          local: params.local,
          master_timeout: params.masterTimeout,
          features: params.features,
        },
        {
          opaqueId: "elasticsearch_get_index_info",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createGetIndexInfoMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          throw createGetIndexInfoMcpError(`Index not found: ${args?.index}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("timeout") || error.message.includes("timed_out")) {
          throw createGetIndexInfoMcpError(`Operation timed out: ${error.message}`, {
            type: "timeout",
            details: { originalError: error.message },
          });
        }
      }

      throw createGetIndexInfoMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: { args },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_get_index_info",

    {
      title: "Get Index Info",

      description:
        "Get comprehensive index information from Elasticsearch including aliases, mappings, and settings. Best for index inspection, configuration analysis, data stream monitoring. Empty {} parameters will default to getting info for all indices ('*'). Use when you need detailed metadata about Elasticsearch indices with feature filtering capabilities for selective information retrieval.",

      inputSchema: {
        index: z.any(), // Index name(s) or pattern(s) to get info for. Use '*' for all indices. Examples: 'logs-*', ['users', 'products'], '*'
        allowNoIndices: z.boolean().optional(), // Whether to ignore if a wildcard indices expression resolves into no concrete indices
        expandWildcards: z.any().optional(), // Type of index that wildcard patterns can match
        flatSettings: z.boolean().optional(), // Return settings in flat format
        ignoreUnavailable: z.boolean().optional(), // Whether specified concrete indices should be ignored when unavailable
        includeDefaults: z.boolean().optional(), // Whether to return default values in the response
        local: z.boolean().optional(), // Return local information, do not retrieve the state from master node
        masterTimeout: z.string().optional(), // Timeout for connection to master node
        features: z.any().optional(), // Feature(s) to retrieve from indices. Allows filtering response content
      },
    },

    getIndexInfoHandler,
  );
};
