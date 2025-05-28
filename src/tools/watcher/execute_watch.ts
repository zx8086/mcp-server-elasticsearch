/* src/tools/watcher/execute_watch.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
} from "../types.js";

// Define the parameter schema
const ExecuteWatchParams = z.object({
  id: z.string().optional(),
  action_modes: z.record(z.enum(["simulate", "force_simulate", "execute", "force_execute", "skip"])).optional(),
  alternative_input: z.record(z.any()).optional(),
  ignore_condition: z.boolean().optional(),
  record_execution: z.boolean().optional(),
  simulated_actions: z.object({
    actions: z.array(z.string()).optional(),
    all: z.boolean().optional(),
    use_all: z.boolean().optional(),
  }).optional(),
  trigger_data: z.object({
    scheduled_time: z.string().optional(),
    triggered_time: z.string().optional(),
  }).optional(),
  watch: z.object({
    actions: z.record(z.any()).optional(),
    condition: z.record(z.any()).optional(),
    input: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
    status: z.record(z.any()).optional(),
    throttle_period: z.string().optional(),
    throttle_period_in_millis: z.number().optional(),
    transform: z.record(z.any()).optional(),
    trigger: z.record(z.any()).optional(),
  }).optional(),
  debug: z.boolean().optional(),
});

type ExecuteWatchParamsType = z.infer<typeof ExecuteWatchParams>;

export const registerWatcherExecuteWatchTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const executeWatchImpl = async (
    params: ExecuteWatchParamsType,
    extra: Record<string, unknown>,
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
    "watcher_execute_watch",
    "Run a watch. This API can be used to force execution of the watch outside of its triggering logic or to simulate the watch execution for debugging purposes. You can use the run watch API to run watches that are not yet registered by specifying the watch definition inline.",
    {
      id: z.string().optional(),
      action_modes: z.record(z.enum(["simulate", "force_simulate", "execute", "force_execute", "skip"])).optional(),
      alternative_input: z.record(z.any()).optional(),
      ignore_condition: z.boolean().optional(),
      record_execution: z.boolean().optional(),
      simulated_actions: z.object({
        actions: z.array(z.string()).optional(),
        all: z.boolean().optional(),
        use_all: z.boolean().optional(),
      }).optional(),
      trigger_data: z.object({
        scheduled_time: z.string().optional(),
        triggered_time: z.string().optional(),
      }).optional(),
      watch: z.object({
        actions: z.record(z.any()).optional(),
        condition: z.record(z.any()).optional(),
        input: z.record(z.any()).optional(),
        metadata: z.record(z.any()).optional(),
        status: z.record(z.any()).optional(),
        throttle_period: z.string().optional(),
        throttle_period_in_millis: z.number().optional(),
        transform: z.record(z.any()).optional(),
        trigger: z.record(z.any()).optional(),
      }).optional(),
      debug: z.boolean().optional(),
    },
    withReadOnlyCheck(
      "watcher_execute_watch",
      executeWatchImpl,
      OperationType.WRITE,
    ),
  );
};
