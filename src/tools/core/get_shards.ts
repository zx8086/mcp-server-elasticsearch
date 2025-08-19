/* src/tools/core/get_shards.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const GetShardsParams = z.object({
  index: z.string().optional().describe("Optional Elasticsearch index name to get shard information for"),
  limit: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    ])
    .pipe(z.number().min(1).max(1000))
    .optional()
    .describe("Maximum number of shards to return (default: 100, max: 1000). Unhealthy shards are prioritized."),
  sortBy: z
    .enum(["state", "index", "size", "docs"])
    .optional()
    .describe("Sort order for shards. 'state' sorts unhealthy first (default: 'state')"),
});

type GetShardsParamsType = z.infer<typeof GetShardsParams>;

export const registerGetShardsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_get_shards",
    "Get shard information. WARNING: Clusters often have 1000+ shards. Check cluster stats first to see shard count. If >500 shards, MUST use 'limit' or will fail. Patterns: {limit: 100, sortBy: 'state'} for health check, {limit: 50, sortBy: 'size'} for storage analysis. Empty {} only works for small clusters (<500 shards).",
    GetShardsParams,
    async (params: GetShardsParamsType): Promise<SearchResult> => {
      const { index, limit, sortBy } = params;
      try {
        logger.debug("Getting shard information", { index, limit, sortBy });

        // Get all shards first
        const response = await esClient.cat.shards({
          ...(index && { index }),
          format: "json",
          h: "index,shard,prirep,state,docs,store,ip,node",
        });

        const totalShards = response.length;
        logger.debug("Retrieved shard information", { totalCount: totalShards, requestedLimit: limit });

        // Sort shards based on sortBy parameter
        let sortedShards = [...response];

        // Sort with unhealthy shards first for 'state' sorting
        if (sortBy === "state") {
          sortedShards.sort((a, b) => {
            // Priority: UNASSIGNED > INITIALIZING > RELOCATING > STARTED
            const stateOrder: Record<string, number> = {
              UNASSIGNED: 0,
              INITIALIZING: 1,
              RELOCATING: 2,
              STARTED: 3,
            };
            const aOrder = stateOrder[a.state as string] ?? 4;
            const bOrder = stateOrder[b.state as string] ?? 4;
            if (aOrder !== bOrder) return aOrder - bOrder;
            // Secondary sort by index name
            return (a.index as string).localeCompare(b.index as string);
          });
        } else if (sortBy === "size") {
          sortedShards.sort((a, b) => {
            const sizeA = parseInt((a.store as string)?.replace(/[^\d]/g, "") || "0");
            const sizeB = parseInt((b.store as string)?.replace(/[^\d]/g, "") || "0");
            return sizeB - sizeA; // Descending
          });
        } else if (sortBy === "docs") {
          sortedShards.sort((a, b) => {
            const docsA = parseInt((a.docs as string) || "0");
            const docsB = parseInt((b.docs as string) || "0");
            return docsB - docsA; // Descending
          });
        } else if (sortBy === "index") {
          sortedShards.sort((a, b) => (a.index as string).localeCompare(b.index as string));
        }

        // Apply limit if specified by LLM
        const limitedShards = limit ? sortedShards.slice(0, limit) : sortedShards;

        // Count unhealthy shards for summary
        const unhealthyCount = response.filter((s) => s.state !== "STARTED").length;

        const shardsInfo = limitedShards.map((shard) => ({
          index: shard.index,
          shard: shard.shard,
          prirep: shard.prirep,
          state: shard.state,
          docs: shard.docs,
          store: shard.store,
          ip: shard.ip,
          node: shard.node,
        }));

        // Create informative metadata
        let metadataText = `Found ${totalShards} total shards${index ? ` for index ${index}` : ""}`;

        // Warn if response is very large and no limit was specified
        if (!limit && totalShards > 1000) {
          metadataText = `⚠️ Response contains ${totalShards} shards. Consider using 'limit' parameter to reduce response size.`;
          if (unhealthyCount > 0) {
            metadataText += `\n📊 ${unhealthyCount} unhealthy shards in cluster`;
          }
          metadataText += `\n💡 Example: {limit: 100, sortBy: 'state'} to see top 100 shards with unhealthy first`;
        } else if (limit && totalShards > limit) {
          metadataText = `📊 Showing ${limit} of ${totalShards} shards${sortBy ? ` (sorted by ${sortBy})` : ""}`;
          if (unhealthyCount > 0) {
            metadataText += `\n⚠️ ${unhealthyCount} unhealthy shards in cluster`;
          }
        }

        const metadataFragment: TextContent = {
          type: "text",
          text: metadataText,
        };

        return {
          content: [metadataFragment, { type: "text", text: JSON.stringify(shardsInfo, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to get shard information:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` } as TextContent,
          ],
        };
      }
    },
  );
};
