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
    _all: z.object({
      analyzer: z.string().optional(),
      enabled: z.boolean(),
      omit_norms: z.boolean().optional(),
      search_analyzer: z.string().optional(),
      search_quote_analyzer: z.string().optional(),
      store: z.boolean().optional(),
      term_vector: z.enum(["no", "yes", "with_positions", "with_offsets", "with_positions_offsets", "with_positions_payloads", "with_positions_offsets_payloads"]).optional(),
    }).optional(),
    date_detection: z.boolean().optional(),
    dynamic: z.enum(["true", "false", "strict", "runtime"]).optional(),
    dynamic_date_formats: z.array(z.string()).optional(),
    dynamic_templates: z.array(z.record(z.any())).optional(),
    _field_names: z.object({
      enabled: z.boolean(),
    }).optional(),
    _meta: z.record(z.any()).optional(),
    numeric_detection: z.boolean().optional(),
    properties: z.record(z.any()).optional(),
    _routing: z.object({
      required: z.boolean(),
    }).optional(),
    _source: z.object({
      enabled: z.boolean(),
      excludes: z.array(z.string()).optional(),
      includes: z.array(z.string()).optional(),
    }).optional(),
    runtime: z.record(z.any()).optional(),
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
    params: any,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    const typedParams = params as RolloverParamsType;
    try {
      const result = await esClient.indices.rollover({
        alias: typedParams.alias,
        new_index: typedParams.new_index,
        aliases: typedParams.aliases,
        conditions: typedParams.conditions,
        mappings: typedParams.mappings,
        settings: typedParams.settings,
        dry_run: typedParams.dry_run,
        master_timeout: typedParams.master_timeout,
        timeout: typedParams.timeout,
        wait_for_active_shards: typedParams.wait_for_active_shards,
        lazy: typedParams.lazy,
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
    "elasticsearch_rollover",
    "Roll over to a new index in Elasticsearch for data streams or aliases. Best for index lifecycle management, data stream rotation, automated archiving. Use when you need to create new indices based on size, age, or document count thresholds in Elasticsearch.",
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
    },
    withReadOnlyCheck(
      "elasticsearch_rollover",
      rolloverImpl,
      OperationType.WRITE,
    ),
  );
};
