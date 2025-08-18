/* src/tools/watcher/execute_watch.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const ExecuteWatchParams = z.object({
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

type ExecuteWatchParamsType = z.infer<typeof ExecuteWatchParams>;

export const registerWatcherExecuteWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const executeWatchImpl = async (
    params: ExecuteWatchParamsType,
    _extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
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
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to execute watch:", {
        error: error instanceof Error ? error.message : String(error),
        watchId: params.id,
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  };

  server.tool(
    "elasticsearch_watcher_execute_watch",
    "Execute a watch in Elasticsearch Watcher for testing or debugging. Best for watch testing, debugging workflows, manual execution. Use when you need to force watch execution outside normal triggers in Elasticsearch alerting systems.",
    {
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
    },
    withReadOnlyCheck("elasticsearch_watcher_execute_watch", executeWatchImpl, OperationType.WRITE),
  );
};
