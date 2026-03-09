/* src/tools/watcher/put_watch.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const putWatchValidator = z.object({
  id: z.string().min(1, "Watch ID cannot be empty"),
  actions: z
    .record(
      z.string(),
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

type _PutWatchParams = z.infer<typeof putWatchValidator>;

// MCP error handling
function createPutWatchMcpError(
  error: Error | string,
  context: { type: "validation" | "execution" | "watch_already_exists"; details?: any },
): McpError {
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
        actions: params.actions as any,
        condition: params.condition as any,
        input: params.input as any,
        metadata: params.metadata as any,
        throttle_period: params.throttle_period,
        throttle_period_in_millis: params.throttle_period_in_millis,
        transform: params.transform as any,
        trigger: params.trigger as any,
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
        throw createPutWatchMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
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

      description:
        "Create or update a watch in Elasticsearch Watcher. Best for alerting setup, monitoring automation, notification configuration. Use when you need to define watch triggers and actions for Elasticsearch alerting workflows. IMPORTANT: Use only this API, not direct index operations. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        id: z.string(), // Watch ID
        actions: z.object({}).optional(), // Actions to execute when watch triggers
        condition: z.object({}).optional(), // Condition that determines when to execute actions
        input: z.object({}).optional(), // Input for the watch execution
        metadata: z.object({}).optional(), // Watch metadata
        throttle_period: z.string().optional(), // Throttle period for watch execution
        throttle_period_in_millis: z.number().optional(), // Throttle period in milliseconds
        transform: z.object({}).optional(), // Transform to apply to watch payload
        trigger: z.object({}).optional(), // Trigger that determines when watch should run
        active: z.boolean().optional(), // Whether the watch is active
        if_primary_term: z.number().optional(), // Only perform operation if primary term matches
        if_seq_no: z.number().optional(), // Only perform operation if sequence number matches
        version: z.number().optional(), // Explicit version number for concurrency control
      },
    },

    withReadOnlyCheck("elasticsearch_watcher_put_watch", putWatchHandler, OperationType.WRITE),
  );
};
