/* src/tools/index_management/refresh_index.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { coerceBoolean } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const refreshIndexSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "Name of the index to refresh",
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
  },
  required: ["index"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const refreshIndexValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  ignoreUnavailable: coerceBoolean.optional(),
  allowNoIndices: coerceBoolean.optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
});

type RefreshIndexParams = z.infer<typeof refreshIndexValidator>;

// MCP error handling
function createRefreshIndexMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_refresh_index] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerRefreshIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const refreshIndexHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = refreshIndexValidator.parse(args);

      const result = await esClient.indices.refresh({
        index: params.index,
        ignore_unavailable: params.ignoreUnavailable,
        allow_no_indices: params.allowNoIndices,
        expand_wildcards: params.expandWildcards,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow index refresh operation", { duration, index: params.index });
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
        throw createRefreshIndexMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle index not found error
      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createRefreshIndexMcpError(`Index not found: ${args.index}`, {
          type: "index_not_found",
          details: { index: args.index },
        });
      }

      throw createRefreshIndexMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_refresh_index",
    "Refresh an index in Elasticsearch. Best for data visibility, search consistency, real-time operations. Use when you need to make recently indexed documents immediately searchable in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",
    refreshIndexSchema,
    withReadOnlyCheck("elasticsearch_refresh_index", refreshIndexHandler, OperationType.WRITE),
  );
};
