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
    summary: {
      type: "boolean",
      description: "Return summarized node statistics instead of full details",
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
  summary: z.boolean().optional(),
});

type NodesStatsParams = z.infer<typeof nodesStatsValidator>;

// Helper function to format node stats summary
function formatNodeStatsSummary(result: any): string {
  if (!result.nodes) return "No node statistics available";
  
  const summary: string[] = ["## Node Statistics Summary\n"];
  
  for (const [nodeId, node] of Object.entries(result.nodes)) {
    const nodeStats = node as any;
    summary.push(`### Node: ${nodeStats.name || nodeId}`);
    summary.push(`- **ID**: ${nodeId}`);
    
    // OS Stats
    if (nodeStats.os) {
      summary.push(`- **CPU Usage**: ${nodeStats.os.cpu?.percent || 'N/A'}%`);
      if (nodeStats.os.mem) {
        const usedMemPct = nodeStats.os.mem.used_percent || 0;
        const totalMemGB = Math.round((nodeStats.os.mem.total_in_bytes || 0) / 1024 / 1024 / 1024);
        summary.push(`- **Memory Usage**: ${usedMemPct}% (${totalMemGB}GB total)`);
      }
      if (nodeStats.os.swap) {
        summary.push(`- **Swap Usage**: ${Math.round((nodeStats.os.swap.used_in_bytes || 0) / 1024 / 1024)}MB`);
      }
    }
    
    // JVM Stats
    if (nodeStats.jvm) {
      if (nodeStats.jvm.mem) {
        const heapUsedPct = nodeStats.jvm.mem.heap_used_percent || 0;
        const heapMaxGB = Math.round((nodeStats.jvm.mem.heap_max_in_bytes || 0) / 1024 / 1024 / 1024);
        summary.push(`- **JVM Heap**: ${heapUsedPct}% used (${heapMaxGB}GB max)`);
      }
      if (nodeStats.jvm.gc) {
        const youngCollections = nodeStats.jvm.gc.collectors?.young?.collection_count || 0;
        const oldCollections = nodeStats.jvm.gc.collectors?.old?.collection_count || 0;
        summary.push(`- **GC Collections**: Young: ${youngCollections}, Old: ${oldCollections}`);
      }
      if (nodeStats.jvm.uptime_in_millis) {
        const uptimeHours = Math.round(nodeStats.jvm.uptime_in_millis / 1000 / 60 / 60);
        summary.push(`- **JVM Uptime**: ${uptimeHours}h`);
      }
    }
    
    // File System Stats
    if (nodeStats.fs) {
      if (nodeStats.fs.total) {
        const totalGB = Math.round((nodeStats.fs.total.total_in_bytes || 0) / 1024 / 1024 / 1024);
        const freeGB = Math.round((nodeStats.fs.total.free_in_bytes || 0) / 1024 / 1024 / 1024);
        const usedPct = totalGB > 0 ? Math.round(((totalGB - freeGB) / totalGB) * 100) : 0;
        summary.push(`- **Disk Usage**: ${usedPct}% (${freeGB}GB free of ${totalGB}GB)`);
      }
    }
    
    // Process Stats
    if (nodeStats.process) {
      if (nodeStats.process.cpu) {
        summary.push(`- **Process CPU**: ${nodeStats.process.cpu.percent || 'N/A'}%`);
      }
      if (nodeStats.process.open_file_descriptors) {
        const openFDs = nodeStats.process.open_file_descriptors;
        const maxFDs = nodeStats.process.max_file_descriptors || 'N/A';
        summary.push(`- **File Descriptors**: ${openFDs}/${maxFDs}`);
      }
    }
    
    // Indices Stats (if available)
    if (nodeStats.indices) {
      if (nodeStats.indices.docs) {
        const docCount = nodeStats.indices.docs.count || 0;
        summary.push(`- **Documents**: ${docCount.toLocaleString()}`);
      }
      if (nodeStats.indices.store) {
        const sizeGB = Math.round((nodeStats.indices.store.size_in_bytes || 0) / 1024 / 1024 / 1024);
        summary.push(`- **Index Size**: ${sizeGB}GB`);
      }
    }
    
    summary.push(""); // Empty line between nodes
  }
  
  return summary.join("\n");
}

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
      const { nodeId, metric, indexMetric, level, timeout, summary } = params;

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

        // Format response based on summary parameter
        const responseContent = summary ? 
          formatNodeStatsSummary(minimalResult) : 
          JSON.stringify(minimalResult, null, 2);

        return {
          content: [
            {
              type: "text",
              text: "⚠️ No metric specified. Returning minimal stats (os,jvm at node level). Specify 'metric' parameter for other stats.",
            } as TextContent,
            { type: "text", text: responseContent } as TextContent,
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

        // Format response based on summary parameter
        const responseContent = summary ? 
          formatNodeStatsSummary(result) : 
          JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: "⚠️ 'indices' metric without indexMetric defaults to 'docs,store' only. Specify indexMetric for more details.",
            } as TextContent,
            { type: "text", text: responseContent } as TextContent,
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

      // Format final response based on summary parameter
      const responseContent = summary ? 
        formatNodeStatsSummary(result) : 
        JSON.stringify(result, null, 2);

      return {
        content: [{ type: "text", text: responseContent } as TextContent],
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
