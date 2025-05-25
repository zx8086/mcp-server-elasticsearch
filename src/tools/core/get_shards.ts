/* src/tools/core/get_shards.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetShardsTool(server, esClient) {
  server.tool(
    "get_shards",
    "Get shard information for all or specific indices",
    {
      index: z
        .string()
        .optional()
        .describe("Optional index name to get shard information for"),
    },
    async ({ index }) => {
      try {
        logger.debug("Getting shard information", { index });
        const response = await esClient.cat.shards({
          ...(index && { index }),
          format: 'json'
        });
        logger.debug("Retrieved shard information", { count: response.length });
        const shardsInfo = response.map((shard) => ({
          index: shard.index,
          shard: shard.shard,
          prirep: shard.prirep,
          state: shard.state,
          docs: shard.docs,
          store: shard.store,
          ip: shard.ip,
          node: shard.node,
        }));
        const metadataFragment = {
          type: "text",
          text: `Found ${shardsInfo.length} shards${index ? ` for index ${index}` : ""}`,
        };
        return {
          content: [
            metadataFragment,
            { type: "text", text: JSON.stringify(shardsInfo, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("Failed to get shard information:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return {
          content: [
            { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
} 