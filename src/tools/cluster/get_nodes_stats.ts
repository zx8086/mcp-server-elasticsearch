/* src/tools/cluster/get_nodes_stats.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const GetNodesStatsParams = z.object({
  nodeId: z.string().optional().describe("Specific node ID, or leave empty for all nodes"),
  metric: z.string().optional().describe("CRITICAL: Specify exact metrics needed. Options: 'os', 'jvm', 'fs', 'process', 'http', 'transport', 'indices'. Combine: 'os,jvm'"),
  indexMetric: z.string().optional().describe("When using 'indices' metric, MUST specify: 'docs', 'store', 'indexing', 'search', 'segments', etc."),
  level: z.enum(["node", "indices", "shards"]).optional().describe("Aggregation level. Use 'node' for node-level stats (default)"),
  timeout: z.string().optional().describe("Timeout for the request"),
});

type GetNodesStatsParamsType = z.infer<typeof GetNodesStatsParams>;
export const registerGetNodesStatsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_get_nodes_stats",
    "Get node statistics. WARNING: Returns massive data without metric filter. BEST PRACTICES: {metric: 'jvm', level: 'node'} for JVM summary, {metric: 'os'} for system stats, {metric: 'fs'} for disk only, {metric: 'indices', indexMetric: 'docs,store'} for index metrics. NEVER use empty {} or {metric: 'indices'} without indexMetric.",
    GetNodesStatsParams,
    async (params: GetNodesStatsParamsType): Promise<SearchResult> => {
      try {
        // Debug logging to understand what parameters we're receiving
        logger.info("get_nodes_stats called with params:", {
          params,
          paramsType: typeof params,
          paramsKeys: params ? Object.keys(params) : null,
          hasMetric: !!params?.metric,
          metricValue: params?.metric
        });
        
        const { nodeId, metric, indexMetric, level, timeout } = params || {};
        
        logger.info("Extracted parameters:", { nodeId, metric, indexMetric, level, timeout, hasMetric: !!metric });
        
        // Warn if no metric specified or problematic combinations
        if (!metric) {
          logger.warn("nodes.stats called without metric - response will be very large");
          
          // Force minimal metrics if not specified
          const minimalResult = await esClient.nodes.stats({
            node_id: nodeId,
            metric: "os,jvm",  // Minimal useful metrics
            level: "node",  // Node level stats
            timeout: timeout,
          });
          
          return {
            content: [
              { 
                type: "text", 
                text: "⚠️ No metric specified. Returning minimal stats (os,jvm at node level). Specify 'metric' parameter for other stats." 
              },
              { type: "text", text: JSON.stringify(minimalResult, null, 2) }
            ],
          };
        }
        
        // Warn about indices without indexMetric
        if (metric.includes("indices") && !indexMetric) {
          logger.warn("'indices' metric without indexMetric will return excessive data");
          
          // If indices metric without specification, limit to basic stats
          const result = await esClient.nodes.stats({
            node_id: nodeId,
            metric: metric,
            index_metric: "docs,store",  // Just document count and size
            level: level,
            timeout: timeout,
          });
          
          return {
            content: [
              { 
                type: "text", 
                text: "⚠️ 'indices' metric without indexMetric defaults to 'docs,store' only. Specify indexMetric for more details." 
              },
              { type: "text", text: JSON.stringify(result, null, 2) }
            ],
          };
        }
        
        // Normal execution with specified parameters
        const result = await esClient.nodes.stats({
          node_id: nodeId,
          metric: metric,
          index_metric: indexMetric,
          level: level,
          timeout: timeout,
        });
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get nodes stats:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
};
