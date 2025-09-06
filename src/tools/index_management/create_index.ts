/* src/tools/index_management/create_index.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

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
  server.tool(
    "elasticsearch_create_index",
    "Create an index in Elasticsearch with custom settings and mappings. Best for index initialization, schema definition, data structure setup. Use when you need to create new Elasticsearch indices with specific configurations for document storage. Uses direct JSON Schema and standardized MCP error codes.",
  {
    index: z.string(), // Name of the index to create
    aliases: z.object({}).optional(), // Index aliases to set during creation
    mappings: z.object({}).optional(), // Field mappings for the index
    settings: z.object({}).optional(), // Index settings configuration
    timeout: z.string().optional(), // Operation timeout (e.g., '30s')
    masterTimeout: z.string().optional(), // Master node timeout (e.g., '30s')
    waitForActiveShards: z.any().optional(), // Number of active shards to wait for
  },
    withReadOnlyCheck("elasticsearch_create_index", createIndexHandler, OperationType.WRITE),
  );
};
