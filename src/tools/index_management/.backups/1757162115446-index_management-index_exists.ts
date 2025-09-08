/* src/tools/index_management/index_exists.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { coerceBoolean } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const indexExistsSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "Name of the index to check existence for",
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
      description: "Return settings in flat format",
    },
    includeDefaults: {
      type: "boolean",
      description: "Include default settings",
    },
    local: {
      type: "boolean",
      description: "Return local information only",
    },
  },
  required: ["index"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const indexExistsValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  ignoreUnavailable: coerceBoolean.optional(),
  allowNoIndices: coerceBoolean.optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  flatSettings: coerceBoolean.optional(),
  includeDefaults: coerceBoolean.optional(),
  local: coerceBoolean.optional(),
});

type IndexExistsParams = z.infer<typeof indexExistsValidator>;

// MCP error handling
function createIndexExistsMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_index_exists] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerIndexExistsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const indexExistsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = indexExistsValidator.parse(args);

      const exists = await esClient.indices.exists({
        index: params.index,
        ignore_unavailable: params.ignoreUnavailable,
        allow_no_indices: params.allowNoIndices,
        expand_wildcards: params.expandWildcards,
        flat_settings: params.flatSettings,
        include_defaults: params.includeDefaults,
        local: params.local,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow index existence check operation", { duration, index: params.index });
      }

      return {
        content: [
          {
            type: "text",
            text: `Exists: ${exists}`,
          },
        ],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createIndexExistsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createIndexExistsMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_index_exists",

    {

      title: "Index Exists",

      description: "Check if an index exists in Elasticsearch. Best for index validation, conditional operations, deployment checks. Use when you need to verify index presence in Elasticsearch clusters before performing operations or creating indices. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: indexExistsSchema,

    },

    withReadOnlyCheck("elasticsearch_index_exists", indexExistsHandler, OperationType.READ),

  );;
};
