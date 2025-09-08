/* src/tools/index_management/put_mapping.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { coerceBoolean } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const putMappingSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "Name of the index to update mapping for",
    },
    properties: {
      type: "object",
      additionalProperties: true,
      description: "Field mappings to add or update",
    },
    runtime: {
      type: "object",
      additionalProperties: true,
      description: "Runtime fields configuration",
    },
    meta: {
      type: "object",
      additionalProperties: true,
      description: "Metadata for the mapping",
    },
    dynamic: {
      type: "string",
      enum: ["true", "false", "strict", "runtime"],
      description: "Dynamic mapping behavior",
    },
    dateDetection: {
      type: "boolean",
      description: "Enable or disable date detection",
    },
    dynamicDateFormats: {
      type: "array",
      items: { type: "string" },
      description: "Dynamic date formats",
    },
    dynamicTemplates: {
      type: "array",
      items: { type: "object", additionalProperties: true },
      description: "Dynamic mapping templates",
    },
    numericDetection: {
      type: "boolean",
      description: "Enable or disable numeric detection",
    },
    timeout: {
      type: "string",
      description: "Operation timeout (e.g., '30s')",
    },
    masterTimeout: {
      type: "string",
      description: "Master node timeout (e.g., '30s')",
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
    writeIndexOnly: {
      type: "boolean",
      description: "Update only the write index for aliases",
    },
  },
  required: ["index"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const putMappingValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  properties: z.object({}).passthrough().optional(),
  runtime: z.object({}).passthrough().optional(),
  meta: z.object({}).passthrough().optional(),
  dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(),
  dateDetection: coerceBoolean.optional(),
  dynamicDateFormats: z.array(z.string()).optional(),
  dynamicTemplates: z.array(z.object({}).passthrough()).optional(),
  numericDetection: coerceBoolean.optional(),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  ignoreUnavailable: coerceBoolean.optional(),
  allowNoIndices: coerceBoolean.optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  writeIndexOnly: coerceBoolean.optional(),
});

type PutMappingParams = z.infer<typeof putMappingValidator>;

// MCP error handling
function createPutMappingMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    resource_already_exists: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_put_mapping] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerPutMappingTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const putMappingHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = putMappingValidator.parse(args);

      const result = await esClient.indices.putMapping({
        index: params.index,
        properties: params.properties,
        runtime: params.runtime,
        _meta: params.meta,
        dynamic: params.dynamic,
        date_detection: params.dateDetection,
        dynamic_date_formats: params.dynamicDateFormats,
        dynamic_templates: params.dynamicTemplates,
        numeric_detection: params.numericDetection,
        timeout: params.timeout,
        master_timeout: params.masterTimeout,
        ignore_unavailable: params.ignoreUnavailable,
        allow_no_indices: params.allowNoIndices,
        expand_wildcards: params.expandWildcards,
        write_index_only: params.writeIndexOnly,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow mapping update operation", { duration, index: params.index });
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
        throw createPutMappingMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle index not found error
      if (error instanceof Error && error.message.includes("index_not_found_exception")) {
        throw createPutMappingMcpError(`Index not found: ${args.index}`, {
          type: "index_not_found",
          details: { index: args.index },
        });
      }

      // Handle mapping conflicts
      if (error instanceof Error && error.message.includes("strict_dynamic_mapping_exception")) {
        throw createPutMappingMcpError(`Mapping conflict: ${error.message}`, {
          type: "resource_already_exists",
          details: { index: args.index },
        });
      }

      throw createPutMappingMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_put_mapping",

    {

      title: "Put Mapping",

      description: "Update index mappings in Elasticsearch. Best for schema evolution, field addition, mapping modifications. Use when you need to add new fields or update existing field mappings in Elasticsearch indices. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: putMappingSchema,

    },

    withReadOnlyCheck("elasticsearch_put_mapping", putMappingHandler, OperationType.WRITE),

  );;
};
