/* src/tools/index_management/flush_index.ts */
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
const flushIndexValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  ignoreUnavailable: coerceBoolean.optional(),
  allowNoIndices: coerceBoolean.optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  force: coerceBoolean.optional(),
  waitIfOngoing: coerceBoolean.optional(),
});

type _FlushIndexParams = z.infer<typeof flushIndexValidator>;

// MCP error handling
function createFlushIndexMcpError(
  error: Error | string,
  context: { type: "validation" | "execution" | "index_not_found"; details?: any },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_flush_index] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerFlushIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const flushIndexHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = flushIndexValidator.parse(args);

      const result = await esClient.indices.flush({
        index: params.index,
        ignore_unavailable: params.ignoreUnavailable,
        allow_no_indices: params.allowNoIndices,
        expand_wildcards: params.expandWildcards,
        force: params.force,
        wait_if_ongoing: params.waitIfOngoing,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow index flush operation", { duration, index: params.index });
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
        throw createFlushIndexMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      // Handle index not found error
      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createFlushIndexMcpError(`Index not found: ${args.index}`, {
          type: "index_not_found",
          details: { index: args.index },
        });
      }

      throw createFlushIndexMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_flush_index",

    {
      title: "Flush Index",

      description:
        "Flush an Elasticsearch index to ensure all data is written to disk. Best for data persistence, index optimization, ensuring durability. Use when you need to force Elasticsearch to write buffered data to storage for consistency. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        index: z.string(), // Name of the index to flush
        ignoreUnavailable: z.boolean().optional(), // Ignore unavailable indices
        allowNoIndices: z.boolean().optional(), // Allow wildcards that match no indices
        expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(), // Which indices to expand wildcards to
        force: z.boolean().optional(), // Force the flush operation even if not required
        waitIfOngoing: z.boolean().optional(), // Wait if another flush operation is ongoing
      },
    },

    withReadOnlyCheck("elasticsearch_flush_index", flushIndexHandler, OperationType.WRITE),
  );
};
