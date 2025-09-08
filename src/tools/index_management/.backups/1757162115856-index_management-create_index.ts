/* src/tools/index_management/create_index.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const createIndexSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "Name of the index to create",
    },
    aliases: {
      type: "object",
      additionalProperties: true,
      description: "Index aliases to set during creation",
    },
    mappings: {
      type: "object",
      additionalProperties: true,
      description: "Field mappings for the index",
    },
    settings: {
      type: "object",
      additionalProperties: true,
      description: "Index settings configuration",
    },
    timeout: {
      type: "string",
      description: "Operation timeout (e.g., '30s')",
    },
    masterTimeout: {
      type: "string",
      description: "Master node timeout (e.g., '30s')",
    },
    waitForActiveShards: {
      oneOf: [
        { type: "string", enum: ["all"] },
        { type: "integer", minimum: 1, maximum: 9 },
      ],
      description: "Number of active shards to wait for",
    },
  },
  required: ["index"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const createIndexValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  aliases: z.object({}).passthrough().optional(),
  mappings: z.object({}).passthrough().optional(),
  settings: z.object({}).passthrough().optional(),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
});

type CreateIndexParams = z.infer<typeof createIndexValidator>;

// MCP error handling
function createCreateIndexMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_already_exists: ErrorCode.InvalidRequest,
    resource_already_exists: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_create_index] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerCreateIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const createIndexHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = createIndexValidator.parse(args);

      const result = await esClient.indices.create(
        {
          index: params.index,
          aliases: params.aliases,
          mappings: params.mappings,
          settings: params.settings,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
          wait_for_active_shards: params.waitForActiveShards,
        },
        {
          opaqueId: "elasticsearch_create_index",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow index creation operation", { duration, index: params.index });
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
        throw createCreateIndexMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Handle index already exists error
      if (error instanceof Error && error.message.includes("resource_already_exists_exception")) {
        throw createCreateIndexMcpError(`Index already exists: ${args.index}`, {
          type: "index_already_exists",
          details: { index: args.index },
        });
      }

      throw createCreateIndexMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_create_index",

    {

      title: "Create Index",

      description: "Create an index in Elasticsearch with custom settings and mappings. Best for index initialization, schema definition, data structure setup. Use when you need to create new Elasticsearch indices with specific configurations for document storage. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: createIndexSchema,

    },

    withReadOnlyCheck("elasticsearch_create_index", createIndexHandler, OperationType.WRITE),

  );;
};
