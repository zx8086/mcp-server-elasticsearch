/* src/tools/cluster/get_nodes_info.ts */
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
const nodesInfoValidator = z.object({
  nodeId: z.string().optional(),
  metric: z.string().optional(),
  flatSettings: z.boolean().optional(),
  timeout: z.string().optional(),
  compact: z.boolean().optional(),
  summary: z.boolean().optional(),
});

type NodesInfoParams = z.infer<typeof nodesInfoValidator>;

// Helper function to format node info summary
function formatNodeInfoSummary(result: any): string {
  if (!result.nodes) return "No node information available";

  const summary: string[] = ["## Node Information Summary\n"];

  for (const [nodeId, node] of Object.entries(result.nodes)) {
    const nodeInfo = node as any;
    summary.push(`### Node: ${nodeInfo.name || nodeId}`);
    summary.push(`- **ID**: ${nodeId}`);

    if (nodeInfo.ip) {
      summary.push(`- **IP**: ${nodeInfo.ip}`);
    }

    if (nodeInfo.roles) {
      summary.push(`- **Roles**: ${nodeInfo.roles.join(", ")}`);
    }

    if (nodeInfo.version) {
      summary.push(`- **Version**: ${nodeInfo.version}`);
    }

    if (nodeInfo.os) {
      summary.push(`- **OS**: ${nodeInfo.os.pretty_name || nodeInfo.os.name || "Unknown"}`);
      if (nodeInfo.os.arch) summary.push(`- **Architecture**: ${nodeInfo.os.arch}`);
    }

    if (nodeInfo.jvm) {
      summary.push(`- **JVM**: ${nodeInfo.jvm.vm_name} ${nodeInfo.jvm.version}`);
      if (nodeInfo.jvm.mem) {
        summary.push(`- **JVM Heap**: ${Math.round(nodeInfo.jvm.mem.heap_max_in_bytes / 1024 / 1024 / 1024)}GB`);
      }
    }

    if (nodeInfo.process) {
      summary.push(`- **CPU Cores**: ${nodeInfo.process.cpu.total_cores || "Unknown"}`);
      if (nodeInfo.process.mem) {
        summary.push(`- **System Memory**: ${Math.round(nodeInfo.process.mem.total_in_bytes / 1024 / 1024 / 1024)}GB`);
      }
    }

    summary.push(""); // Empty line between nodes
  }

  return summary.join("\n");
}

// MCP error handling
function createNodesInfoMcpError(
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

  return new McpError(errorCodeMap[context.type], `[elasticsearch_get_nodes_info] ${message}`, context.details);
}

// Tool implementation
export const registerGetNodesInfoTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const nodesInfoHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    const requestId = Math.random().toString(36).substring(7);

    try {
      // Validate parameters
      const params = nodesInfoValidator.parse(args);
      const { nodeId, metric, flatSettings, timeout, compact, summary } = params;

      logger.info(`[${requestId}] Nodes info request received`, {
        params: {
          ...params,
          nodeId: params.nodeId ? "[REDACTED]" : undefined,
        },
      });

      logger.debug("Getting nodes info", { nodeId, metric, compact });

      let result: any;

      // Handle no parameters - return minimal info
      if (!metric && !compact) {
        logger.warn("nodes.info called without metric or compact - forcing minimal response");

        // Return just node names to prevent huge response
        result = await esClient.nodes.info(
          {
            node_id: nodeId,
            metric: "name", // Just node names
            flat_settings: flatSettings,
            timeout: timeout,
          },
          {
            opaqueId: "elasticsearch_get_nodes_info",
          },
        );

        const duration = performance.now() - perfStart;
        if (duration > 5000) {
          logger.warn("Slow nodes info operation", { duration, requestId });
        }

        return {
          content: [
            {
              type: "text",
              text: "⚠️ No parameters specified. Returning node names only. Use {metric: 'os,jvm'} for basic info or {compact: true} for essential metrics.",
            } as TextContent,
            { type: "text", text: JSON.stringify(result, null, 2) } as TextContent,
          ],
        };
      }

      if (compact === true) {
        // Compact mode: request only essential metrics (overrides metric param)
        result = await esClient.nodes.info(
          {
            node_id: nodeId,
            metric: "os,jvm,process,transport", // Essential metrics only
            flat_settings: flatSettings,
            timeout: timeout,
          },
          {
            opaqueId: "elasticsearch_get_nodes_info",
          },
        );

        const duration = performance.now() - perfStart;
        if (duration > 5000) {
          logger.warn("Slow nodes info operation", { duration, requestId });
        }

        // Format compact response
        const responseContent = summary ? formatNodeInfoSummary(result) : JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: "📊 Compact node information (os,jvm,process,transport metrics)",
            } as TextContent,
            { type: "text", text: responseContent } as TextContent,
          ],
        };
      }

      // Use specified metric or fail gracefully
      result = await esClient.nodes.info(
        {
          node_id: nodeId,
          metric: metric,
          flat_settings: flatSettings,
          timeout: timeout,
        },
        {
          opaqueId: "elasticsearch_get_nodes_info",
        },
      );

      logger.info(`[${requestId}] Successfully retrieved nodes info`, {
        nodeCount: Object.keys(result.nodes || {}).length,
        metric: metric || "all",
        compact: compact || false,
      });

      const duration = performance.now() - perfStart;
      if (duration > 10000) {
        logger.warn("Slow nodes info operation", { duration, requestId });
      }

      // Format final response
      const responseContent = summary ? formatNodeInfoSummary(result) : JSON.stringify(result, null, 2);

      return {
        content: [{ type: "text", text: responseContent } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createNodesInfoMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        // Cluster-specific error handling
        if (error.message.includes("cluster_block_exception") || error.message.includes("cluster_unhealthy")) {
          throw createNodesInfoMcpError(`Cluster is unhealthy: ${error.message}`, {
            type: "cluster_unhealthy",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("node_not_connected") || error.message.includes("no_node_available")) {
          throw createNodesInfoMcpError(`Node unavailable: ${error.message}`, {
            type: "node_unavailable",
            details: { originalError: error.message },
          });
        }
      }

      logger.error(`[${requestId}] Failed to get nodes info:`, {
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

      throw createNodesInfoMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_get_nodes_info",

    {

      title: "Get Nodes Info",

      description: "Get node information (static configuration). WARNING: Full info exceeds 1MB per node. SAFE OPTIONS: {metric: 'name'} for node list, {metric: 'os,jvm'} for basic info, {metric: 'process,transport'} for network info. The 'compact' parameter auto-selects essential metrics. NEVER use empty {} - it will fail. READ operation - safe for production use.",

      inputSchema: {
      nodeId: z.string().optional(), // Specific node ID, or '_local' for current node, or leave empty for all
      metric: z.string().optional(), // Specific metrics: 'name', 'os', 'jvm', 'process', 'thread_pool', 'transport', 'http', 'plugins', 'ingest'. Combine: 'os,jvm'
      flatSettings: z.boolean().optional(), // Return settings in flat format
      timeout: z.string().optional(), // Timeout for the request (e.g., '30s', '1m')
      compact: z.boolean().optional(), // Auto-select essential metrics (os,jvm,process,transport). Overrides 'metric' parameter
      summary: z.boolean().optional(), // Return summarized node information instead of full details
    },

    },

    nodesInfoHandler,

  );
};
