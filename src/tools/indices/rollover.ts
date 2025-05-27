/* src/tools/indices/rollover.ts */

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
const RolloverParams = z.object({
  alias: z.string().min(1, "Alias name is required"),
  new_index: z.string().optional(),
  aliases: z.record(z.object({
    filter: z.record(z.any()).optional(),
    index_routing: z.string().optional(),
    is_hidden: z.boolean().optional(),
    is_write_index: z.boolean().optional(),
    routing: z.string().optional(),
    search_routing: z.string().optional(),
  })).optional(),
  conditions: z.object({
    min_age: z.string().optional(),
    max_age: z.string().optional(),
    max_age_millis: z.number().optional(),
    min_docs: z.number().optional(),
    max_docs: z.number().optional(),
    max_size: z.string().optional(),
    max_size_bytes: z.number().optional(),
    min_size: z.string().optional(),
    min_size_bytes: z.number().optional(),
    max_primary_shard_size: z.string().optional(),
    max_primary_shard_size_bytes: z.number().optional(),
    min_primary_shard_size: z.string().optional(),
    min_primary_shard_size_bytes: z.number().optional(),
    max_primary_shard_docs: z.number().optional(),
    min_primary_shard_docs: z.number().optional(),
  }).optional(),
  mappings: z.object({
    all_field: z.record(z.any()).optional(),
    date_detection: z.boolean().optional(),
    dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(),
    dynamic_date_formats: z.array(z.string()).optional(),
    dynamic_templates: z.array(z.record(z.any())).optional(),
    _field_names: z.record(z.any()).optional(),
    index_field: z.record(z.any()).optional(),
    _meta: z.record(z.any()).optional(),
    numeric_detection: z.boolean().optional(),
    properties: z.record(z.any()).optional(),
    _routing: z.record(z.any()).optional(),
    _size: z.record(z.any()).optional(),
    _source: z.record(z.any()).optional(),
    runtime: z.record(z.any()).optional(),
    enabled: z.boolean().optional(),
    subobjects: z.boolean().optional(),
    _data_stream_timestamp: z.record(z.any()).optional(),
  }).optional(),
  settings: z.record(z.any()).optional(),
  dry_run: z.boolean().optional(),
  master_timeout: z.string().optional(),
  timeout: z.string().optional(),
  wait_for_active_shards: z.union([z.number(), z.enum(["all", "index-setting"])]).optional(),
  lazy: z.boolean().optional(),
});

type RolloverParamsType = z.infer<typeof RolloverParams>;

export const registerRolloverTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const rolloverImpl = async (
    params: RolloverParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.indices.rollover({
        alias: params.alias,
        new_index: params.new_index,
        aliases: params.aliases,
        conditions: params.conditions,
        mappings: params.mappings,
        settings: params.settings,
        dry_run: params.dry_run,
        master_timeout: params.master_timeout,
        timeout: params.timeout,
        wait_for_active_shards: params.wait_for_active_shards,
        lazy: params.lazy,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to rollover index:", {
        error: error instanceof Error ? error.message : String(error),
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
    "rollover",
    "Roll over to a new index. TIP: It is recommended to use the index lifecycle rollover action to automate rollovers. The rollover API creates a new index for a data stream or index alias. The API behavior depends on the rollover target.",
    {
      alias: z.string().min(1, "Alias name is required"),
      new_index: z.string().optional(),
      aliases: z.record(z.object({
        filter: z.record(z.any()).optional(),
        index_routing: z.string().optional(),
        is_hidden: z.boolean().optional(),
        is_write_index: z.boolean().optional(),
        routing: z.string().optional(),
        search_routing: z.string().optional(),
      })).optional(),
      conditions: z.object({
        min_age: z.string().optional(),
        max_age: z.string().optional(),
        max_age_millis: z.number().optional(),
        min_docs: z.number().optional(),
        max_docs: z.number().optional(),
        max_size: z.string().optional(),
        max_size_bytes: z.number().optional(),
        min_size: z.string().optional(),
        min_size_bytes: z.number().optional(),
        max_primary_shard_size: z.string().optional(),
        max_primary_shard_size_bytes: z.number().optional(),
        min_primary_shard_size: z.string().optional(),
        min_primary_shard_size_bytes: z.number().optional(),
        max_primary_shard_docs: z.number().optional(),
        min_primary_shard_docs: z.number().optional(),
      }).optional(),
      mappings: z.object({
        all_field: z.record(z.any()).optional(),
        date_detection: z.boolean().optional(),
        dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(),
        dynamic_date_formats: z.array(z.string()).optional(),
        dynamic_templates: z.array(z.record(z.any())).optional(),
        _field_names: z.record(z.any()).optional(),
        index_field: z.record(z.any()).optional(),
        _meta: z.record(z.any()).optional(),
        numeric_detection: z.boolean().optional(),
        properties: z.record(z.any()).optional(),
        _routing: z.record(z.any()).optional(),
        _size: z.record(z.any()).optional(),
        _source: z.record(z.any()).optional(),
        runtime: z.record(z.any()).optional(),
        enabled: z.boolean().optional(),
        subobjects: z.boolean().optional(),
        _data_stream_timestamp: z.record(z.any()).optional(),
      }).optional(),
      settings: z.record(z.any()).optional(),
      dry_run: z.boolean().optional(),
      master_timeout: z.string().optional(),
      timeout: z.string().optional(),
      wait_for_active_shards: z.union([z.number(), z.enum(["all", "index-setting"])]).optional(),
      lazy: z.boolean().optional(),
    },
    withReadOnlyCheck(
      "rollover",
      rolloverImpl,
      OperationType.WRITE,
    ),
  );
};
