/* src/tools/indices/field_usage_stats.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const fieldUsageStatsValidator = z.object({
  index: z.union([z.string(), z.array(z.string())]),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .or(z.array(z.enum(["all", "open", "closed", "hidden", "none"])))
    .optional(),
  ignoreUnavailable: booleanField().optional(),
  fields: z.union([z.string(), z.array(z.string())]).optional(),
});

type FieldUsageStatsParams = z.infer<typeof fieldUsageStatsValidator>;

// MCP error handling
function createFieldUsageStatsMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "index_not_found" | "field_not_found";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    field_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_field_usage_stats] ${message}`, context.details);
}

// Tool implementation
export const registerFieldUsageStatsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const fieldUsageStatsHandler = async (args: any): Promise<SearchResult> => {
    try {
      // Validate parameters
      const params = fieldUsageStatsValidator.parse(args);

      logger.debug("Getting field usage stats", { index: params.index, fields: params.fields });

      const result = await esClient.indices.fieldUsageStats(
        {
          index: params.index,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          ignore_unavailable: params.ignoreUnavailable,
          fields: params.fields,
        },
        {
          opaqueId: "elasticsearch_field_usage_stats",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createFieldUsageStatsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          throw createFieldUsageStatsMcpError(`Index not found: ${args?.index}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("field_not_found") || error.message.includes("no such field")) {
          throw createFieldUsageStatsMcpError(`Field not found: ${args?.fields}`, {
            type: "field_not_found",
            details: { originalError: error.message },
          });
        }
      }

      throw createFieldUsageStatsMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: { args },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_field_usage_stats",
    "Get field usage statistics per shard and field in Elasticsearch. Best for query optimization, field analysis, performance tuning. Use when you need to understand which fields are accessed during queries for Elasticsearch index optimization.",
    {
      index: z.any(), // Index name(s) or pattern(s) to get field usage stats for. Examples: 'logs-*', ['users', 'products']
      allowNoIndices: z.boolean().optional(), // Whether to ignore if a wildcard indices expression resolves into no concrete indices
      expandWildcards: z.any().optional(), // Type of index that wildcard patterns can match
      ignoreUnavailable: z.boolean().optional(), // Whether specified concrete indices should be ignored when unavailable
      fields: z.any().optional(), // Field name(s) to get usage stats for. If not specified, stats for all fields are returned
    },
    fieldUsageStatsHandler,
  );
};
