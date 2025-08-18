/* src/tools/watcher/put_watch.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const PutWatchParams = z.object({
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

type PutWatchParamsType = z.infer<typeof PutWatchParams>;

export const registerWatcherPutWatchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Implementation function without read-only checks
  const putWatchImpl = async (params: PutWatchParamsType, _extra: Record<string, unknown>): Promise<SearchResult> => {
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
    },
    withReadOnlyCheck("elasticsearch_watcher_put_watch", putWatchImpl, OperationType.WRITE),
  );
};
