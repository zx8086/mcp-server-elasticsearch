/* src/tools/core/get_shards.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

const getShardsSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Optional Elasticsearch index name to get shard information for"
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 1000,
      description: "Maximum number of shards to return (default: 100, max: 1000). Unhealthy shards are prioritized."
    },
    sortBy: {
      type: "string",
      enum: ["state", "index", "size", "docs"],
      description: "Sort order for shards. 'state' sorts unhealthy first (default: 'state')"
    }
  },
  additionalProperties: false
};

const getShardsValidator = z.object({
  index: z.string().optional(),
  limit: z.number().min(1).max(1000).optional(),
  sortBy: z.enum(["state", "index", "size", "docs"]).optional(),
});

type GetShardsParams = z.infer<typeof getShardsValidator>;

function createGetShardsMcpError(
  error: Error | string,
  context: { type: string; details?: any }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  if (message.includes('index_not_found')) {
    return new McpError(ErrorCode.InvalidRequest, `Index not found: ${context.details?.index || 'unknown'}`);
  }
  
  if (message.includes('cluster_block_exception')) {
    return new McpError(ErrorCode.InvalidRequest, 'Cluster is blocked for shard operations');
  }
  
  if (message.includes('timeout')) {
    return new McpError(ErrorCode.RequestTimeout, 'Request timed out while retrieving shard information');
  }
  
  return new McpError(ErrorCode.InternalError, `Failed to get shard information: ${message}`);
}

export const registerGetShardsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getShardsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      const params = getShardsValidator.parse(args);
      const { index, limit, sortBy } = params;
      
      logger.debug("Getting shard information", { index, limit, sortBy });

      const response = await esClient.cat.shards({
        ...(index && { index }),
        format: "json",
        h: "index,shard,prirep,state,docs,store,ip,node",
      });

      const totalShards = response.length;
      const duration = performance.now() - perfStart;
      logger.debug("Retrieved shard information", { 
        totalCount: totalShards, 
        requestedLimit: limit,
        duration: `${duration.toFixed(2)}ms`
      });

      const sortedShards = [...response];

      if (sortBy === "state") {
        sortedShards.sort((a, b) => {
          const stateOrder: Record<string, number> = {
            UNASSIGNED: 0,
            INITIALIZING: 1,
            RELOCATING: 2,
            STARTED: 3,
          };
          const aOrder = stateOrder[a.state as string] ?? 4;
          const bOrder = stateOrder[b.state as string] ?? 4;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return (a.index as string).localeCompare(b.index as string);
        });
      } else if (sortBy === "size") {
        sortedShards.sort((a, b) => {
          const sizeA = Number.parseInt((a.store as string)?.replace(/[^\d]/g, "") || "0");
          const sizeB = Number.parseInt((b.store as string)?.replace(/[^\d]/g, "") || "0");
          return sizeB - sizeA;
        });
      } else if (sortBy === "docs") {
        sortedShards.sort((a, b) => {
          const docsA = Number.parseInt((a.docs as string) || "0");
          const docsB = Number.parseInt((b.docs as string) || "0");
          return docsB - docsA;
        });
      } else if (sortBy === "index") {
        sortedShards.sort((a, b) => (a.index as string).localeCompare(b.index as string));
      }

      const limitedShards = limit ? sortedShards.slice(0, limit) : sortedShards;
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

      let metadataText = `Found ${totalShards} total shards${index ? ` for index ${index}` : ""}`;

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

      return {
        content: [
          { type: "text", text: metadataText },
          { type: "text", text: JSON.stringify(shardsInfo, null, 2) }
        ],
      };
    } catch (error) {
      const duration = performance.now() - perfStart;
      logger.error("Failed to get shard information", { 
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration.toFixed(2)}ms`
      });
      throw createGetShardsMcpError(error instanceof Error ? error : new Error(String(error)), {
        type: 'get_shards',
        details: args
      });
    }
  };

  server.tool(
    "elasticsearch_get_shards",
    "Get shard information. WARNING: Clusters often have 1000+ shards. Check cluster stats first to see shard count. If >500 shards, MUST use 'limit' or will fail. Patterns: {limit: 100, sortBy: 'state'} for health check, {limit: 50, sortBy: 'size'} for storage analysis. Empty {} only works for small clusters (<500 shards). Uses direct JSON Schema and standardized MCP error codes.",
    getShardsSchema,
    getShardsHandler
  );
};
