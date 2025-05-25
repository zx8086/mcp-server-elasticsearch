/* src/tools/index_management/create_index.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerCreateIndexTool(server, esClient) {
  server.tool(
    "create_index",
    "Create an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      aliases: z.record(z.any()).optional(),
      mappings: z.record(z.any()).optional(),
      settings: z.record(z.any()).optional(),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      waitForActiveShards: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.create({
          index: params.index,
          aliases: params.aliases,
          mappings: params.mappings,
          settings: params.settings,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
          wait_for_active_shards: params.waitForActiveShards,
        }, {
          opaqueId: 'create_index'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to create index:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 