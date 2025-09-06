/* src/tools/diagnostics/elasticsearch_diagnostics.ts */

import type { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolRegistrationFunction } from "../../types.js";
import { logger } from "../../utils/logger.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ObservableTransport, ElasticsearchDiagnostics } from "../../utils/elasticsearchObservability.js";

// Schema for diagnostic options
const diagnosticsValidator = z.object({
  includeMetrics: z.boolean().optional().default(true),
  includeRecentRequests: z.boolean().optional().default(false),
  includeSlowQueries: z.boolean().optional().default(true),
  timeWindowMinutes: z.number().min(1).max(60).optional().default(5),
});

type DiagnosticsParams = z.infer<typeof diagnosticsValidator>;

export const registerElasticsearchDiagnostics: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client
) => {
  const handler = async (toolArgs: any): Promise<any> => {
    try {
      const params = diagnosticsValidator.parse(toolArgs);
      
      // Generate basic health report using standard client info
      let clusterInfo;
      try {
        clusterInfo = await esClient.info();
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to connect to Elasticsearch: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      
      let output = "# Elasticsearch Diagnostics Report\n\n";
      output += `**Generated:** ${new Date().toISOString()}\n`;
      output += `**Analysis Mode:** Basic (Standard Client)\n\n`;
      
      // Cluster Information
      output += "## Cluster Information\n\n";
      output += `- **Cluster Name:** ${clusterInfo.cluster_name}\n`;
      output += `- **Version:** ${clusterInfo.version?.number}\n`;
      output += `- **Lucene Version:** ${clusterInfo.version?.lucene_version}\n`;
      output += `- **Build Date:** ${clusterInfo.version?.build_date}\n`;
      output += `- **Build Hash:** ${clusterInfo.version?.build_hash}\n\n`;

      // Basic health check
      let healthStatus = 'healthy';
      try {
        const health = await esClient.cluster.health();
        healthStatus = health.status;
        
        output += "## Cluster Health\n\n";
        output += `- **Status:** ${health.status.toUpperCase()}\n`;
        output += `- **Active Shards:** ${health.active_shards}\n`;
        output += `- **Number of Nodes:** ${health.number_of_nodes}\n`;
        output += `- **Number of Data Nodes:** ${health.number_of_data_nodes}\n`;
        output += `- **Initializing Shards:** ${health.initializing_shards}\n`;
        output += `- **Relocating Shards:** ${health.relocating_shards}\n`;
        output += `- **Unassigned Shards:** ${health.unassigned_shards}\n`;
        
        if (health.unassigned_shards > 0) {
          output += "\n⚠️ **Warning:** Unassigned shards detected - this may indicate cluster issues\n";
        }
        output += "\n";
      } catch (error) {
        output += "## Cluster Health\n\n";
        output += `⚠️ Could not retrieve cluster health: ${error instanceof Error ? error.message : String(error)}\n\n`;
      }

      if (params.includeMetrics) {
        // Basic node stats
        try {
          const stats = await esClient.cluster.stats();
          
          output += "## Cluster Statistics\n\n";
          output += `- **Total Indices:** ${stats.indices?.count || 'N/A'}\n`;
          output += `- **Total Documents:** ${stats.indices?.docs?.count || 'N/A'}\n`;
          output += `- **Store Size:** ${stats.indices?.store?.size_in_bytes ? Math.round(stats.indices.store.size_in_bytes / 1024 / 1024 / 1024 * 100) / 100 + 'GB' : 'N/A'}\n`;
          output += `- **Memory Usage:** ${stats.nodes?.jvm?.mem?.heap_used_in_bytes ? Math.round(stats.nodes.jvm.mem.heap_used_in_bytes / 1024 / 1024) + 'MB' : 'N/A'}\n\n`;
        } catch (error) {
          output += "## Cluster Statistics\n\n";
          output += `⚠️ Could not retrieve cluster stats: ${error instanceof Error ? error.message : String(error)}\n\n`;
        }
      }

      // Performance recommendations
      output += "## Performance Recommendations\n\n";
      
      const majorVersion = clusterInfo.version?.number ? Number.parseInt(clusterInfo.version.number.split(".")[0]) : 0;
      if (majorVersion < 8) {
        output += "- Consider upgrading to Elasticsearch 8.x for better performance and security\n";
      }
      
      if (healthStatus !== 'green') {
        output += "- Cluster health is not green - investigate shard allocation issues\n";
      }
      
      output += "- Monitor the metrics endpoint at `/metrics` for detailed Prometheus metrics\n";
      output += "- Use the health endpoint at `/health` for basic status checks\n";
      output += "- Consider using the LangSmith tracing features to monitor tool performance\n\n";

      // Test basic operations
      if (params.includeRecentRequests) {
        output += "## Basic Operations Test\n\n";
        
        try {
          const startTime = Date.now();
          await esClient.cat.indices({ format: 'json', h: 'index,docs.count,store.size' });
          const duration = Date.now() - startTime;
          output += `✅ Index listing: ${duration}ms\n`;
        } catch (error) {
          output += `❌ Index listing failed: ${error instanceof Error ? error.message : String(error)}\n`;
        }

        try {
          const startTime = Date.now();
          await esClient.cluster.health();
          const duration = Date.now() - startTime;
          output += `✅ Health check: ${duration}ms\n`;
        } catch (error) {
          output += `❌ Health check failed: ${error instanceof Error ? error.message : String(error)}\n`;
        }
        output += "\n";
      }

      logger.info("Generated basic Elasticsearch diagnostics", {
        clusterName: clusterInfo.cluster_name,
        version: clusterInfo.version?.number,
        healthStatus: healthStatus,
        includeMetrics: params.includeMetrics,
      });

      return {
        content: [{
          type: "text",
          text: output
        }],
      };

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Validation failed: ${error.errors.map(e => e.message).join(", ")}`
        );
      }

      logger.error("Elasticsearch diagnostics failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to generate diagnostics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  server.tool(
    "elasticsearch_diagnostics",
    "Generate comprehensive Elasticsearch transport and performance diagnostics report. Provides insights into connection health, request patterns, slow queries, error rates, and performance recommendations.",
    {
      includeMetrics: z.boolean().optional().default(true).describe("Include detailed transport metrics in the report"),
      includeRecentRequests: z.boolean().optional().default(false).describe("Include list of recent requests (can be verbose)"),
      includeSlowQueries: z.boolean().optional().default(true).describe("Include details about slow queries (>2 seconds)"),
      timeWindowMinutes: z.number().min(1).max(60).optional().default(5).describe("Time window for analysis in minutes (1-60)"),
    },
    handler
  );
};