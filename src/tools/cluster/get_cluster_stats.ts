/* src/tools/cluster/get_cluster_stats.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetClusterStatsTool(server, esClient) {
  server.tool(
    "get_cluster_stats",
    "Get cluster statistics from Elasticsearch",
    {
      nodeId: z.string().optional(),
      timeout: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.cluster.stats({
          node_id: params.nodeId,
          timeout: params.timeout,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get cluster stats:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 