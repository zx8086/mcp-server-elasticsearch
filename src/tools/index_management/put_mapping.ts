/* src/tools/index_management/put_mapping.ts */
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

      inputSchema: {
      index: z.string(), // Name of the index to update mapping for
      properties: z.object({}).optional(), // Field mappings to add or update
      runtime: z.object({}).optional(), // Runtime fields configuration
      meta: z.object({}).optional(), // Metadata for the mapping
      dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(), // Dynamic mapping behavior
      dateDetection: z.boolean().optional(), // Enable or disable date detection
      dynamicDateFormats: z.array(z.string().optional()).optional(), // Dynamic date formats
      dynamicTemplates: z.array(z.object({}).optional()).optional(), // Dynamic mapping templates
      numericDetection: z.boolean().optional(), // Enable or disable numeric detection
      timeout: z.string().optional(), // Operation timeout (e.g., '30s')
      masterTimeout: z.string().optional(), // Master node timeout (e.g., '30s')
      ignoreUnavailable: z.boolean().optional(), // Ignore unavailable indices
      allowNoIndices: z.boolean().optional(), // Allow wildcards that match no indices
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(), // Which indices to expand wildcards to
      writeIndexOnly: z.boolean().optional(), // Update only the write index for aliases
    },

    },

    withReadOnlyCheck("elasticsearch_put_mapping", putMappingHandler, OperationType.WRITE),

  );;
};
