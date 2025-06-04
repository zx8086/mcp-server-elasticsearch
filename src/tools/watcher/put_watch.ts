/* src/tools/watcher/put_watch.ts */

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
const PutWatchParams = z.object({
  id: z.string().min(1, "Watch ID is required"),
  actions: z.record(z.object({
    add_backing_index: z.record(z.any()).optional(),
    remove_backing_index: z.record(z.any()).optional(),
  })).optional(),
  condition: z.object({
    always: z.record(z.any()).optional(),
    array_compare: z.record(z.any()).optional(),
    compare: z.record(z.any()).optional(),
    never: z.record(z.any()).optional(),
    script: z.record(z.any()).optional(),
  }).optional(),
  input: z.object({
    chain: z.record(z.any()).optional(),
    http: z.record(z.any()).optional(),
    search: z.record(z.any()).optional(),
    simple: z.record(z.any()).optional(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
  throttle_period: z.string().optional(),
  throttle_period_in_millis: z.number().optional(),
  transform: z.object({
    chain: z.record(z.any()).optional(),
    script: z.record(z.any()).optional(),
    search: z.record(z.any()).optional(),
  }).optional(),
  trigger: z.object({
    schedule: z.record(z.any()).optional(),
  }).optional(),
  active: z.boolean().optional(),
  if_primary_term: z.number().optional(),
  if_seq_no: z.number().optional(),
  version: z.number().optional(),
});

type PutWatchParamsType = z.infer<typeof PutWatchParams>;

export const registerWatcherPutWatchTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const putWatchImpl = async (
    params: PutWatchParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
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
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to put watch:", {
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
    "elasticsearch_watcher_put_watch",
    "Create or update a watch in Elasticsearch Watcher. Best for alerting setup, monitoring automation, notification configuration. Use when you need to define watch triggers and actions for Elasticsearch alerting workflows. IMPORTANT: Use only this API, not direct index operations.",
    {
      id: z.string().min(1, "Watch ID is required"),
      actions: z.record(z.object({
        add_backing_index: z.record(z.any()).optional(),
        remove_backing_index: z.record(z.any()).optional(),
      })).optional(),
      condition: z.object({
        always: z.record(z.any()).optional(),
        array_compare: z.record(z.any()).optional(),
        compare: z.record(z.any()).optional(),
        never: z.record(z.any()).optional(),
        script: z.record(z.any()).optional(),
      }).optional(),
      input: z.object({
        chain: z.record(z.any()).optional(),
        http: z.record(z.any()).optional(),
        search: z.record(z.any()).optional(),
        simple: z.record(z.any()).optional(),
      }).optional(),
      metadata: z.record(z.any()).optional(),
      throttle_period: z.string().optional(),
      throttle_period_in_millis: z.number().optional(),
      transform: z.object({
        chain: z.record(z.any()).optional(),
        script: z.record(z.any()).optional(),
        search: z.record(z.any()).optional(),
      }).optional(),
      trigger: z.object({
        schedule: z.record(z.any()).optional(),
      }).optional(),
      active: z.boolean().optional(),
      if_primary_term: z.number().optional(),
      if_seq_no: z.number().optional(),
      version: z.number().optional(),
    },
    withReadOnlyCheck(
      "elasticsearch_watcher_put_watch",
      putWatchImpl,
      OperationType.WRITE,
    ),
  );
};
