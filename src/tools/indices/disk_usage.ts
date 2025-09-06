/* src/tools/indices/disk_usage.ts */
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
const diskUsageValidator = z.object({
  index: z.union([z.string(), z.array(z.string())]),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .or(z.array(z.enum(["all", "open", "closed", "hidden", "none"])))
    .optional(),
  flush: booleanField().optional(),
  ignoreUnavailable: booleanField().optional(),
  runExpensiveTasks: booleanField().optional(),
});

type DiskUsageParams = z.infer<typeof diskUsageValidator>;

// MCP error handling
function createDiskUsageMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "index_not_found" | "permission_denied";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    permission_denied: ErrorCode.MethodNotAllowed,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_disk_usage] ${message}`, context.details);
}

// Tool implementation
export const registerDiskUsageTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const diskUsageHandler = async (args: any): Promise<SearchResult> => {
    try {
      // Validate parameters
      const params = diskUsageValidator.parse(args);

      logger.debug("Analyzing disk usage", { index: params.index });

      const result = await esClient.indices.diskUsage(
        {
          index: params.index,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flush: params.flush,
          ignore_unavailable: params.ignoreUnavailable,
          run_expensive_tasks: params.runExpensiveTasks,
        },
        {
          opaqueId: "elasticsearch_disk_usage",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createDiskUsageMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          throw createDiskUsageMcpError(`Index not found: ${args?.index}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("security_exception") || error.message.includes("unauthorized")) {
          throw createDiskUsageMcpError(`Permission denied: ${error.message}`, {
            type: "permission_denied",
            details: { originalError: error.message },
          });
        }
      }

      throw createDiskUsageMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: { args },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_disk_usage",
    "Analyze index disk usage per field in Elasticsearch. Best for storage optimization, field analysis, capacity planning. Use when you need to understand disk consumption patterns and optimize storage usage for Elasticsearch indices and data streams.",
    {
      index: z.any(), // Index name(s) or pattern(s) to analyze disk usage for. Examples: 'logs-*', ['users', 'products']
      allowNoIndices: z.boolean().optional(), // Whether to ignore if a wildcard indices expression resolves into no concrete indices
      expandWildcards: z.any().optional(), // Type of index that wildcard patterns can match
      flush: z.boolean().optional(), // Whether to flush the index before getting the disk usage
      ignoreUnavailable: z.boolean().optional(), // Whether specified concrete indices should be ignored when unavailable
      runExpensiveTasks: z.boolean().optional(), // Whether to run expensive disk usage tasks
    },
    diskUsageHandler,
  );
};
