/* src/tools/cluster/get_nodes_stats.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const nodesStatsSchema = {
  type: "object",
  properties: {
    nodeId: {
      type: "string",
      description: "Specific node ID, or leave empty for all nodes",
    },
    metric: {
      type: "string",
      description:
        "CRITICAL: Specify exact metrics needed. Options: 'os', 'jvm', 'fs', 'process', 'http', 'transport', 'indices'. Combine: 'os,jvm'",
    },
    indexMetric: {
      type: "string",
      description: "When using 'indices' metric, MUST specify: 'docs', 'store', 'indexing', 'search', 'segments', etc.",
    },
    level: {
      type: "string",
      enum: ["node", "indices", "shards"],
      description: "Aggregation level. Use 'node' for node-level stats (default)",
    },
    timeout: {
      type: "string",
      description: "Timeout for the request (e.g., '30s', '1m')",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const nodesStatsValidator = z.object({
  nodeId: z.string().optional(),
  metric: z.string().optional(),
  indexMetric: z.string().optional(),
  level: z.enum(["node", "indices", "shards"]).optional(),
  timeout: z.string().optional(),
});

type NodesStatsParams = z.infer<typeof nodesStatsValidator>;

// MCP error handling
function createNodesStatsMcpError(
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

  return new McpError(errorCodeMap[context.type], `[elasticsearch_get_nodes_stats] ${message}`, context.details);
}

// Tool implementation
export const registerGetNodesStatsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const nodesStatsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    const requestId = Math.random().toString(36).substring(7);

    try {
      // Validate parameters
      const params = nodesStatsValidator.parse(args);
      const { nodeId, metric, indexMetric, level, timeout } = params;

      // Debug logging to understand what parameters we're receiving
      logger.info(`[${requestId}] get_nodes_stats called with params:`, {
        params,
        paramsType: typeof params,
        paramsKeys: params ? Object.keys(params) : null,
        hasMetric: !!params?.metric,
        metricValue: params?.metric,
      });

      logger.info("Extracted parameters:", { nodeId, metric, indexMetric, level, timeout, hasMetric: !!metric });

      // Warn if no metric specified or problematic combinations
      if (!metric) {
        logger.warn("nodes.stats called without metric - response will be very large");

        // Force minimal metrics if not specified
        const minimalResult = await esClient.nodes.stats(
          {
            node_id: nodeId,
            metric: "os,jvm", // Minimal useful metrics
            level: "node", // Node level stats
            timeout: timeout,
          },
          {
            opaqueId: "elasticsearch_get_nodes_stats",
          },
        );

        const duration = performance.now() - perfStart;
        if (duration > 10000) {
          logger.warn("Slow nodes stats operation", { duration, requestId });
        }

        return {
          content: [
            {
              type: "text",
              text: "⚠️ No metric specified. Returning minimal stats (os,jvm at node level). Specify 'metric' parameter for other stats.",
            } as TextContent,
            { type: "text", text: JSON.stringify(minimalResult, null, 2) } as TextContent,
          ],
        };
      }

      // Warn about indices without indexMetric
      if (metric.includes("indices") && !indexMetric) {
        logger.warn("'indices' metric without indexMetric will return excessive data");

        // If indices metric without specification, limit to basic stats
        const result = await esClient.nodes.stats(
          {
            node_id: nodeId,
            metric: metric,
            index_metric: "docs,store", // Just document count and size
            level: level,
            timeout: timeout,
          },
          {
            opaqueId: "elasticsearch_get_nodes_stats",
          },
        );

        const duration = performance.now() - perfStart;
        if (duration > 10000) {
          logger.warn("Slow nodes stats operation", { duration, requestId });
        }

        return {
          content: [
            {
              type: "text",
              text: "⚠️ 'indices' metric without indexMetric defaults to 'docs,store' only. Specify indexMetric for more details.",
            } as TextContent,
            { type: "text", text: JSON.stringify(result, null, 2) } as TextContent,
          ],
        };
      }

      // Normal execution with specified parameters
      const result = await esClient.nodes.stats(
        {
          node_id: nodeId,
          metric: metric,
          index_metric: indexMetric,
          level: level,
          timeout: timeout,
        },
        {
          opaqueId: "elasticsearch_get_nodes_stats",
        },
      );

      logger.info(`[${requestId}] Successfully retrieved nodes stats`, {
        nodeCount: Object.keys(result.nodes || {}).length,
        metric: metric || "all",
        indexMetric: indexMetric || "none",
        level: level || "node",
      });

      const duration = performance.now() - perfStart;
      if (duration > 15000) {
        logger.warn("Slow nodes stats operation", { duration, requestId });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createNodesStatsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        // Cluster-specific error handling
        if (error.message.includes("cluster_block_exception") || error.message.includes("cluster_unhealthy")) {
          throw createNodesStatsMcpError(`Cluster is unhealthy: ${error.message}`, {
            type: "cluster_unhealthy",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("node_not_connected") || error.message.includes("no_node_available")) {
          throw createNodesStatsMcpError(`Node unavailable: ${error.message}`, {
            type: "node_unavailable",
            details: { originalError: error.message },
          });
        }
      }

      logger.error(`[${requestId}] Failed to get nodes stats:`, {
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

      throw createNodesStatsMcpError(error instanceof Error ? error.message : String(error), {
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
  server.tool(
    "elasticsearch_get_nodes_stats",
    "Get node statistics. WARNING: Returns massive data without metric filter. BEST PRACTICES: {metric: 'jvm', level: 'node'} for JVM summary, {metric: 'os'} for system stats, {metric: 'fs'} for disk only, {metric: 'indices', indexMetric: 'docs,store'} for index metrics. NEVER use empty {} or {metric: 'indices'} without indexMetric. READ operation - safe for production use.",
    nodesStatsSchema,
    nodesStatsHandler,
  );
};
