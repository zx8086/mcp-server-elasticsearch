/* src/tools/core/get_shards.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const GetShardsParams = z.object({
  index: z
    .string()
    .optional()
    .describe("Optional Elasticsearch index name to get shard information for"),
});

type GetShardsParamsType = z.infer<typeof GetShardsParams>;

export const registerGetShardsTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "elasticsearch_get_shards",
    "Get shard information for all or specific indices in Elasticsearch. Best for cluster monitoring, shard distribution analysis, performance troubleshooting. Use when you need to inspect shard allocation, state, and storage details across Elasticsearch nodes.",
    {
      index: z
        .string()
        .optional()
        .describe("Optional Elasticsearch index name to get shard information for"),
    },
    async (params: GetShardsParamsType): Promise<SearchResult> => {
      const { index } = params;
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
        const metadataFragment: TextContent = {
          type: "text",
          text: `Found ${shardsInfo.length} shards${index ? ` for index ${index}` : ""}`,
        };
        return {
          content: [
            metadataFragment,
            { type: "text", text: JSON.stringify(shardsInfo, null, 2) } as TextContent,
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