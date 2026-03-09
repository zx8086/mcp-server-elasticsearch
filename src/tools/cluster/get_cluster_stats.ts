/* src/tools/cluster/get_cluster_stats.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const clusterStatsValidator = z.object({
  nodeId: z.string().optional(),
  timeout: z.string().optional(),
});

type _ClusterStatsParams = z.infer<typeof clusterStatsValidator>;

// MCP error handling
function createClusterStatsMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "cluster_unhealthy" | "node_unavailable";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    cluster_unhealthy: ErrorCode.InternalError,
    node_unavailable: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_get_cluster_stats] ${message}`, context.details);
}

// Tool implementation
export const registerGetClusterStatsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const clusterStatsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    const requestId = Math.random().toString(36).substring(7);

    try {
      // Validate parameters
      const params = clusterStatsValidator.parse(args);

      logger.info(`[${requestId}] Cluster stats request received`, {
        params: {
          ...params,
          nodeId: params.nodeId ? "[REDACTED]" : undefined,
        },
      });

      logger.info(`[${requestId}] Executing cluster.stats()...`);

      const result = await esClient.cluster.stats(
        {
          node_id: params.nodeId,
          timeout: params.timeout,
        },
        {
          opaqueId: "elasticsearch_get_cluster_stats",
        },
      );

      logger.info(`[${requestId}] Successfully retrieved cluster stats`, {
        clusterName: result.cluster_name,
        status: result.status,
        indices: {
          count: result.indices?.count,
          shards: result.indices?.shards?.total,
          docs: result.indices?.docs?.count,
          store: result.indices?.store?.size_in_bytes,
        },
        nodes: {
          count: result.nodes?.count?.total,
          roles: result.nodes?.count,
        },
      });

      const duration = performance.now() - perfStart;
      if (duration > 10000) {
        logger.warn("Slow cluster stats operation", { duration, requestId });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createClusterStatsMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        // Cluster-specific error handling
        if (error.message.includes("cluster_block_exception") || error.message.includes("cluster_unhealthy")) {
          throw createClusterStatsMcpError(`Cluster is unhealthy: ${error.message}`, {
            type: "cluster_unhealthy",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("node_not_connected") || error.message.includes("no_node_available")) {
          throw createClusterStatsMcpError(`Node unavailable: ${error.message}`, {
            type: "node_unavailable",
            details: { originalError: error.message },
          });
        }
      }

      logger.error(`[${requestId}] Failed to get cluster stats:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : "Unknown",
        cause: error instanceof Error ? error.cause : undefined,
        params: {
          ...args,
          nodeId: args?.nodeId ? "[REDACTED]" : undefined,
        },
        elasticsearchError: error instanceof Error && "meta" in error ? error.meta : undefined,
        statusCode: error instanceof Error && "statusCode" in error ? error.statusCode : undefined,
      });

      throw createClusterStatsMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          requestId,
          args,
        },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_get_cluster_stats",

    {
      title: "Get Cluster Stats",

      description:
        "Get comprehensive cluster statistics from Elasticsearch. Best for cluster monitoring, capacity planning, performance analysis. Use when you need detailed metrics about cluster-wide operations, storage, and resource utilization in Elasticsearch. READ operation - safe for production use.",

      inputSchema: {
        nodeId: z.string().optional(), // A comma-separated list of node IDs or names to limit returned information. Leave empty for all nodes.
        timeout: z.string().optional(), // Explicit operation timeout (e.g., '30s', '1m')
      },
    },

    clusterStatsHandler,
  );
};
