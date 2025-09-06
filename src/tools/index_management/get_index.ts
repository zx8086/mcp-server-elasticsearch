/* src/tools/index_management/get_index.ts */
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
const getIndexValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  ignoreUnavailable: coerceBoolean.optional(),
  allowNoIndices: coerceBoolean.optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  flatSettings: coerceBoolean.optional(),
  includeDefaults: coerceBoolean.optional(),
  local: coerceBoolean.optional(),
  masterTimeout: z.string().optional(),
});

type GetIndexParams = z.infer<typeof getIndexValidator>;

// MCP error handling
function createGetIndexMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_get_index] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerGetIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getIndexHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = getIndexValidator.parse(args);

      const result = await esClient.indices.get({
        index: params.index,
        ignore_unavailable: params.ignoreUnavailable,
        allow_no_indices: params.allowNoIndices,
        expand_wildcards: params.expandWildcards,
        flat_settings: params.flatSettings,
        include_defaults: params.includeDefaults,
        local: params.local,
        master_timeout: params.masterTimeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow index retrieval operation", { duration, index: params.index });
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
        throw createGetIndexMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle index not found error
      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createGetIndexMcpError(`Index not found: ${args.index}`, {
          type: "index_not_found",
          details: { index: args.index },
        });
      }

      throw createGetIndexMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_get_index",
    "Get comprehensive index information from Elasticsearch including settings, mappings, and aliases. Best for index inspection, configuration analysis, troubleshooting. Empty {} parameters will default to getting information for all indices. Use when you need detailed metadata about Elasticsearch indices structure and configuration. Parameters have smart defaults: index='*', ignoreUnavailable=true, allowNoIndices=true. Uses direct JSON Schema and standardized MCP error codes.",
  {
    index: z.string(), // Index pattern to get information for. Use '*' for all indices. Supports wildcards.
    ignoreUnavailable: z.boolean().optional(), // Ignore unavailable indices
    allowNoIndices: z.boolean().optional(), // Allow wildcards that match no indices
    expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(), // Which indices to expand wildcards to: 'all', 'open', 'closed', 'hidden', or 'none'
    flatSettings: z.boolean().optional(), // Return settings in flat format
    includeDefaults: z.boolean().optional(), // Include default settings
    local: z.boolean().optional(), // Return local information only
    masterTimeout: z.string().optional(), // Timeout for connection to master node
  },
    withReadOnlyCheck("elasticsearch_get_index", getIndexHandler, OperationType.READ),
  );
};
