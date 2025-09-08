/* src/tools/watcher/put_watch.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const putWatchSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Watch ID",
    },
    actions: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          add_backing_index: {
            type: "object",
            additionalProperties: true,
            description: "Add backing index action",
          },
          remove_backing_index: {
            type: "object",
            additionalProperties: true,
            description: "Remove backing index action",
          },
        },
        additionalProperties: true,
      },
      description: "Actions to execute when watch triggers",
    },
    condition: {
      type: "object",
      properties: {
        always: {
          type: "object",
          additionalProperties: true,
          description: "Always condition",
        },
        array_compare: {
          type: "object",
          additionalProperties: true,
          description: "Array compare condition",
        },
        compare: {
          type: "object",
          additionalProperties: true,
          description: "Compare condition",
        },
        never: {
          type: "object",
          additionalProperties: true,
          description: "Never condition",
        },
        script: {
          type: "object",
          additionalProperties: true,
          description: "Script condition",
        },
      },
      additionalProperties: true,
      description: "Condition that determines when to execute actions",
    },
    input: {
      type: "object",
      properties: {
        chain: {
          type: "object",
          additionalProperties: true,
          description: "Chain input",
        },
        http: {
          type: "object",
          additionalProperties: true,
          description: "HTTP input",
        },
        search: {
          type: "object",
          additionalProperties: true,
          description: "Search input",
        },
        simple: {
          type: "object",
          additionalProperties: true,
          description: "Simple input",
        },
      },
      additionalProperties: true,
      description: "Input for the watch execution",
    },
    metadata: {
      type: "object",
      additionalProperties: true,
      description: "Watch metadata",
    },
    throttle_period: {
      type: "string",
      description: "Throttle period for watch execution",
    },
    throttle_period_in_millis: {
      type: "number",
      description: "Throttle period in milliseconds",
    },
    transform: {
      type: "object",
      properties: {
        chain: {
          type: "object",
          additionalProperties: true,
          description: "Chain transform",
        },
        script: {
          type: "object",
          additionalProperties: true,
          description: "Script transform",
        },
        search: {
          type: "object",
          additionalProperties: true,
          description: "Search transform",
        },
      },
      additionalProperties: true,
      description: "Transform to apply to watch payload",
    },
    trigger: {
      type: "object",
      properties: {
        schedule: {
          type: "object",
          additionalProperties: true,
          description: "Schedule trigger",
        },
      },
      additionalProperties: true,
      description: "Trigger that determines when watch should run",
    },
    active: {
      type: "boolean",
      description: "Whether the watch is active",
    },
    if_primary_term: {
      type: "number",
      description: "Only perform operation if primary term matches",
    },
    if_seq_no: {
      type: "number",
      description: "Only perform operation if sequence number matches",
    },
    version: {
      type: "number",
      description: "Explicit version number for concurrency control",
    },
  },
  required: ["id"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const putWatchValidator = z.object({
  id: z.string().min(1, "Watch ID cannot be empty"),
  actions: z
    .record(
      z.object({
        add_backing_index: z.object({}).passthrough().optional(),
        remove_backing_index: z.object({}).passthrough().optional(),
      }),
    )
    .optional(),
  condition: z
    .object({
      always: z.object({}).passthrough().optional(),
      array_compare: z.object({}).passthrough().optional(),
      compare: z.object({}).passthrough().optional(),
      never: z.object({}).passthrough().optional(),
      script: z.object({}).passthrough().optional(),
    })
    .optional(),
  input: z
    .object({
      chain: z.object({}).passthrough().optional(),
      http: z.object({}).passthrough().optional(),
      search: z.object({}).passthrough().optional(),
      simple: z.object({}).passthrough().optional(),
    })
    .optional(),
  metadata: z.object({}).passthrough().optional(),
  throttle_period: z.string().optional(),
  throttle_period_in_millis: z.number().optional(),
  transform: z
    .object({
      chain: z.object({}).passthrough().optional(),
      script: z.object({}).passthrough().optional(),
      search: z.object({}).passthrough().optional(),
    })
    .optional(),
  trigger: z
    .object({
      schedule: z.object({}).passthrough().optional(),
    })
    .optional(),
  active: booleanField().optional(),
  if_primary_term: z.number().optional(),
  if_seq_no: z.number().optional(),
  version: z.number().optional(),
});

type PutWatchParams = z.infer<typeof putWatchValidator>;

// MCP error handling
function createPutWatchMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    watch_already_exists: ErrorCode.InvalidRequest,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_put_watch] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherPutWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const putWatchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = putWatchValidator.parse(args);

      const result = await esClient.watcher.putWatch({
        id: params.id,
        actions: params.actions,
        condition: params.condition,
        input: params.input,
        metadata: params.metadata,
        throttle_period: params.throttle_period,
        throttle_period_in_millis: params.throttle_period_in_millis,
        transform: params.transform,
        trigger: params.trigger,
        active: params.active,
        if_primary_term: params.if_primary_term,
        if_seq_no: params.if_seq_no,
        version: params.version,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow watcher operation", { duration });
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
        throw createPutWatchMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Add specific watch error handling
      if (error instanceof Error && error.message.includes("version_conflict_engine_exception")) {
        throw createPutWatchMcpError(error.message, {
          type: "watch_already_exists",
          details: { watchId: args.id },
        });
      }

      throw createPutWatchMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_watcher_put_watch",

    {

      title: "Watcher Put Watch",

      description: "Create or update a watch in Elasticsearch Watcher. Best for alerting setup, monitoring automation, notification configuration. Use when you need to define watch triggers and actions for Elasticsearch alerting workflows. IMPORTANT: Use only this API, not direct index operations. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: putWatchSchema,

    },

    withReadOnlyCheck("elasticsearch_watcher_put_watch", putWatchHandler, OperationType.WRITE),

  );;
};
