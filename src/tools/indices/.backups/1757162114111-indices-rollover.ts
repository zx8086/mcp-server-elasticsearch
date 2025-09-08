/* src/tools/indices/rollover.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const rolloverSchema = {
  type: "object",
  properties: {
    alias: {
      type: "string",
      minLength: 1,
      description: "Alias name for the data stream or index to roll over",
    },
    newIndex: {
      type: "string",
      description: "Name of the new index to create during rollover",
    },
    aliases: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          filter: {
            type: "object",
            additionalProperties: true,
            description: "Query to filter documents for this alias",
          },
          indexRouting: {
            type: "string",
            description: "Value used for index routing",
          },
          isHidden: {
            type: "boolean",
            description: "Whether this alias is hidden",
          },
          isWriteIndex: {
            type: "boolean",
            description: "Whether this alias is the write index",
          },
          routing: {
            type: "string",
            description: "Value used for both index and search routing",
          },
          searchRouting: {
            type: "string",
            description: "Value used for search routing",
          },
        },
        additionalProperties: false,
      },
      description: "Aliases to add to the new index",
    },
    conditions: {
      type: "object",
      properties: {
        minAge: {
          type: "string",
          description: "Minimum age of the index before rollover",
        },
        maxAge: {
          type: "string",
          description: "Maximum age of the index before rollover",
        },
        maxAgeMillis: {
          type: "number",
          description: "Maximum age in milliseconds before rollover",
        },
        minDocs: {
          type: "number",
          description: "Minimum number of documents before rollover",
        },
        maxDocs: {
          type: "number",
          description: "Maximum number of documents before rollover",
        },
        maxSize: {
          type: "string",
          description: "Maximum size of the index before rollover",
        },
        maxSizeBytes: {
          type: "number",
          description: "Maximum size in bytes before rollover",
        },
        minSize: {
          type: "string",
          description: "Minimum size of the index before rollover",
        },
        minSizeBytes: {
          type: "number",
          description: "Minimum size in bytes before rollover",
        },
        maxPrimaryShardSize: {
          type: "string",
          description: "Maximum primary shard size before rollover",
        },
        maxPrimaryShardSizeBytes: {
          type: "number",
          description: "Maximum primary shard size in bytes before rollover",
        },
        minPrimaryShardSize: {
          type: "string",
          description: "Minimum primary shard size before rollover",
        },
        minPrimaryShardSizeBytes: {
          type: "number",
          description: "Minimum primary shard size in bytes before rollover",
        },
        maxPrimaryShardDocs: {
          type: "number",
          description: "Maximum documents per primary shard before rollover",
        },
        minPrimaryShardDocs: {
          type: "number",
          description: "Minimum documents per primary shard before rollover",
        },
      },
      additionalProperties: false,
      description: "Rollover conditions",
    },
    mappings: {
      type: "object",
      additionalProperties: true,
      description: "Mapping definition for the new index",
    },
    settings: {
      type: "object",
      additionalProperties: true,
      description: "Settings for the new index",
    },
    dryRun: {
      type: "boolean",
      description: "Whether to perform a dry run without actually rolling over",
    },
    masterTimeout: {
      type: "string",
      description: "Timeout for connection to master node",
    },
    timeout: {
      type: "string",
      description: "Timeout for the rollover operation",
    },
    waitForActiveShards: {
      oneOf: [{ type: "number" }, { type: "string", enum: ["all", "index-setting"] }],
      description: "Number of active shards to wait for",
    },
    lazy: {
      type: "boolean",
      description: "Whether to perform lazy rollover",
    },
  },
  required: ["alias"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const rolloverValidator = z.object({
  alias: z.string().min(1, "Alias name cannot be empty"),
  newIndex: z.string().optional(),
  aliases: z
    .record(
      z.object({
        filter: z.object({}).passthrough().optional(),
        indexRouting: z.string().optional(),
        isHidden: booleanField().optional(),
        isWriteIndex: booleanField().optional(),
        routing: z.string().optional(),
        searchRouting: z.string().optional(),
      }),
    )
    .optional(),
  conditions: z
    .object({
      minAge: z.string().optional(),
      maxAge: z.string().optional(),
      maxAgeMillis: z.number().optional(),
      minDocs: z.number().optional(),
      maxDocs: z.number().optional(),
      maxSize: z.string().optional(),
      maxSizeBytes: z.number().optional(),
      minSize: z.string().optional(),
      minSizeBytes: z.number().optional(),
      maxPrimaryShardSize: z.string().optional(),
      maxPrimaryShardSizeBytes: z.number().optional(),
      minPrimaryShardSize: z.string().optional(),
      minPrimaryShardSizeBytes: z.number().optional(),
      maxPrimaryShardDocs: z.number().optional(),
      minPrimaryShardDocs: z.number().optional(),
    })
    .optional(),
  mappings: z.object({}).passthrough().optional(),
  settings: z.object({}).passthrough().optional(),
  dryRun: booleanField().optional(),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.number(), z.enum(["all", "index-setting"])]).optional(),
  lazy: booleanField().optional(),
});

type RolloverParams = z.infer<typeof rolloverValidator>;

// MCP error handling
function createRolloverMcpError(
  error: Error | string,
  context: {
    type:
      | "validation"
      | "execution"
      | "alias_not_found"
      | "rollover_conditions_not_met"
      | "index_already_exists"
      | "permission_denied";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    alias_not_found: ErrorCode.InvalidParams,
    rollover_conditions_not_met: ErrorCode.InvalidParams,
    index_already_exists: ErrorCode.InvalidParams,
    permission_denied: ErrorCode.MethodNotAllowed,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_rollover] ${message}`, context.details);
}

// Tool implementation
export const registerRolloverTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const rolloverHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = rolloverValidator.parse(args);

      logger.debug("Rolling over index", {
        alias: params.alias,
        newIndex: params.newIndex,
        conditions: params.conditions,
      });

      const result = await esClient.indices.rollover(
        {
          alias: params.alias,
          new_index: params.newIndex,
          aliases: params.aliases,
          conditions: params.conditions,
          mappings: params.mappings,
          settings: params.settings,
          dry_run: params.dryRun,
          master_timeout: params.masterTimeout,
          timeout: params.timeout,
          wait_for_active_shards: params.waitForActiveShards,
          lazy: params.lazy,
        },
        {
          opaqueId: "elasticsearch_rollover",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 30000) {
        logger.warn("Slow rollover operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createRolloverMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("alias_not_found") || error.message.includes("no such alias")) {
          throw createRolloverMcpError(`Alias not found: ${args?.alias}`, {
            type: "alias_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("rollover_conditions_not_met") || error.message.includes("conditions not met")) {
          throw createRolloverMcpError(`Rollover conditions not met for alias: ${args?.alias}`, {
            type: "rollover_conditions_not_met",
            details: { originalError: error.message, conditions: args?.conditions },
          });
        }

        if (
          error.message.includes("resource_already_exists_exception") ||
          error.message.includes("index_already_exists")
        ) {
          throw createRolloverMcpError(`Index already exists: ${args?.newIndex}`, {
            type: "index_already_exists",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("security_exception") || error.message.includes("unauthorized")) {
          throw createRolloverMcpError(`Permission denied: ${error.message}`, {
            type: "permission_denied",
            details: { originalError: error.message },
          });
        }
      }

      throw createRolloverMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration with read-only check
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_rollover",

    {

      title: "Rollover",

      description: "Roll over to a new index in Elasticsearch for data streams or aliases. Best for index lifecycle management, data stream rotation, automated archiving. Use when you need to create new indices based on size, age, or document count thresholds in Elasticsearch.",

      inputSchema: rolloverSchema,

    },

    withReadOnlyCheck("elasticsearch_rollover", rolloverHandler, OperationType.WRITE),

  );;
};
