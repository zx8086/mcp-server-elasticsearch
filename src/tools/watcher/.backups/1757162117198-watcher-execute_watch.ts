/* src/tools/watcher/execute_watch.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const executeWatchSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description: "Watch ID to execute",
    },
    action_modes: {
      type: "object",
      additionalProperties: {
        type: "string",
        enum: ["simulate", "force_simulate", "execute", "force_execute", "skip"],
      },
      description: "Override action execution modes",
    },
    alternative_input: {
      type: "object",
      additionalProperties: true,
      description: "Alternative input to use instead of the watch input",
    },
    ignore_condition: {
      type: "boolean",
      description: "Whether to ignore the condition and always execute the actions",
    },
    record_execution: {
      type: "boolean",
      description: "Whether to record the execution in the watch history",
    },
    simulated_actions: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: { type: "string" },
          description: "Actions to simulate",
        },
        all: {
          type: "boolean",
          description: "Simulate all actions",
        },
        use_all: {
          type: "boolean",
          description: "Use all actions for simulation",
        },
      },
      additionalProperties: false,
      description: "Actions to simulate instead of executing",
    },
    trigger_data: {
      type: "object",
      properties: {
        scheduled_time: {
          type: "string",
          description: "Scheduled execution time",
        },
        triggered_time: {
          type: "string",
          description: "Trigger execution time",
        },
      },
      additionalProperties: false,
      description: "Trigger data to use for execution",
    },
    watch: {
      type: "object",
      properties: {
        actions: {
          type: "object",
          additionalProperties: true,
          description: "Watch actions definition",
        },
        condition: {
          type: "object",
          additionalProperties: true,
          description: "Watch condition definition",
        },
        input: {
          type: "object",
          additionalProperties: true,
          description: "Watch input definition",
        },
        metadata: {
          type: "object",
          additionalProperties: true,
          description: "Watch metadata",
        },
        status: {
          type: "object",
          additionalProperties: true,
          description: "Watch status information",
        },
        throttle_period: {
          type: "string",
          description: "Throttle period for the watch",
        },
        throttle_period_in_millis: {
          type: "number",
          description: "Throttle period in milliseconds",
        },
        transform: {
          type: "object",
          additionalProperties: true,
          description: "Watch transform definition",
        },
        trigger: {
          type: "object",
          additionalProperties: true,
          description: "Watch trigger definition",
        },
      },
      additionalProperties: false,
      description: "Watch definition to execute inline",
    },
    debug: {
      type: "boolean",
      description: "Enable debug mode for execution",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const executeWatchValidator = z.object({
  id: z.string().optional(),
  action_modes: z.record(z.enum(["simulate", "force_simulate", "execute", "force_execute", "skip"])).optional(),
  alternative_input: z.object({}).passthrough().optional(),
  ignore_condition: booleanField().optional(),
  record_execution: booleanField().optional(),
  simulated_actions: z
    .object({
      actions: z.array(z.string()).optional(),
      all: booleanField().optional(),
      use_all: booleanField().optional(),
    })
    .optional(),
  trigger_data: z
    .object({
      scheduled_time: z.string().optional(),
      triggered_time: z.string().optional(),
    })
    .optional(),
  watch: z
    .object({
      actions: z.object({}).passthrough().optional(),
      condition: z.object({}).passthrough().optional(),
      input: z.object({}).passthrough().optional(),
      metadata: z.object({}).passthrough().optional(),
      status: z.object({}).passthrough().optional(),
      throttle_period: z.string().optional(),
      throttle_period_in_millis: z.number().optional(),
      transform: z.object({}).passthrough().optional(),
      trigger: z.object({}).passthrough().optional(),
    })
    .optional(),
  debug: booleanField().optional(),
});

type ExecuteWatchParams = z.infer<typeof executeWatchValidator>;

// MCP error handling
function createExecuteWatchMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    watch_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(
    errorCodeMap[context.type] || ErrorCode.InternalError,
    `[elasticsearch_watcher_execute_watch] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerWatcherExecuteWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const executeWatchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = executeWatchValidator.parse(args);

      const result = await esClient.watcher.executeWatch({
        id: params.id,
        action_modes: params.action_modes,
        alternative_input: params.alternative_input,
        ignore_condition: params.ignore_condition,
        record_execution: params.record_execution,
        simulated_actions: params.simulated_actions,
        trigger_data: params.trigger_data,
        watch: params.watch,
        debug: params.debug,
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
        throw createExecuteWatchMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      // Add specific watch error handling
      if (error instanceof Error && error.message.includes("watch_not_found")) {
        throw createExecuteWatchMcpError(error.message, {
          type: "watch_not_found",
          details: { watchId: args.id },
        });
      }

      throw createExecuteWatchMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_watcher_execute_watch",
    "Execute a watch in Elasticsearch Watcher for testing or debugging. Best for watch testing, debugging workflows, manual execution. Use when you need to force watch execution outside normal triggers in Elasticsearch alerting systems. Uses direct JSON Schema and standardized MCP error codes.",
    executeWatchSchema,
    withReadOnlyCheck("elasticsearch_watcher_execute_watch", executeWatchHandler, OperationType.WRITE),
  );
};
