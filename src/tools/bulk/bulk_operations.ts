import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerBulkOperationsTool(server, esClient) {
  server.tool(
    "bulk_operations",
    "Perform bulk operations in Elasticsearch",
    {
      operations: z.array(z.record(z.any())),
      index: z.string().optional(),
      routing: z.string().optional(),
      pipeline: z.string().optional(),
      refresh: z.string().optional(),
      requireAlias: z.boolean().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.bulk({
          operations: params.operations,
          index: params.index,
          routing: params.routing,
          pipeline: params.pipeline,
          refresh: params.refresh,
          require_alias: params.requireAlias,
          timeout: params.timeout,
          wait_for_active_shards: params.waitForActiveShards,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to perform bulk operations:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 