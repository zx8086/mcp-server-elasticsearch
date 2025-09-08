/* src/tools/index_management/delete_index.ts */
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
const deleteIndexValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  ignoreUnavailable: coerceBoolean.optional(),
  allowNoIndices: coerceBoolean.optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
});

type DeleteIndexParams = z.infer<typeof deleteIndexValidator>;

// MCP error handling
function createDeleteIndexMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_delete_index] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerDeleteIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const deleteIndexHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = deleteIndexValidator.parse(args);

      const result = await esClient.indices.delete({
        index: params.index,
        timeout: params.timeout,
        master_timeout: params.masterTimeout,
        ignore_unavailable: params.ignoreUnavailable,
        allow_no_indices: params.allowNoIndices,
        expand_wildcards: params.expandWildcards,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow index deletion operation", { duration, index: params.index });
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
        throw createDeleteIndexMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle index not found error
      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createDeleteIndexMcpError(`Index not found: ${args.index}`, {
          type: "index_not_found",
          details: { index: args.index },
        });
      }

      throw createDeleteIndexMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_delete_index",

    {

      title: "Delete Index",

      description: "Delete an entire index in Elasticsearch. Best for index cleanup, data lifecycle management, removing obsolete indices. Use when you need to permanently remove complete Elasticsearch indices and all their documents. DESTRUCTIVE OPERATION. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
      index: z.string(), // Name of the index to delete
      timeout: z.string().optional(), // Operation timeout (e.g., '30s')
      masterTimeout: z.string().optional(), // Master node timeout (e.g., '30s')
      ignoreUnavailable: z.boolean().optional(), // Ignore unavailable indices
      allowNoIndices: z.boolean().optional(), // Allow wildcards that match no indices
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(), // Which indices to expand wildcards to
    },

    },

    withReadOnlyCheck("elasticsearch_delete_index", deleteIndexHandler, OperationType.DESTRUCTIVE),

  );;
};
