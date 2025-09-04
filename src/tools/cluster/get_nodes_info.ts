/* src/tools/cluster/get_nodes_info.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const nodesInfoSchema = {
  type: "object",
  properties: {
    nodeId: {
      type: "string",
      description: "Specific node ID, or '_local' for current node, or leave empty for all",
    },
    metric: {
      type: "string",
      description:
        "Specific metrics: 'name', 'os', 'jvm', 'process', 'thread_pool', 'transport', 'http', 'plugins', 'ingest'. Combine: 'os,jvm'",
    },
    flatSettings: {
      type: "boolean",
      description: "Return settings in flat format",
    },
    timeout: {
      type: "string",
      description: "Timeout for the request (e.g., '30s', '1m')",
    },
    compact: {
      type: "boolean",
      description: "Auto-select essential metrics (os,jvm,process,transport). Overrides 'metric' parameter",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const nodesInfoValidator = z.object({
  nodeId: z.string().optional(),
  metric: z.string().optional(),
  flatSettings: z.boolean().optional(),
  timeout: z.string().optional(),
  compact: z.boolean().optional(),
});

type NodesInfoParams = z.infer<typeof nodesInfoValidator>;

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
      const { nodeId, metric, flatSettings, timeout, compact } = params;

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

        return {
          content: [
            {
              type: "text",
              text: "📊 Compact node information (os,jvm,process,transport metrics)",
            } as TextContent,
            { type: "text", text: JSON.stringify(result, null, 2) } as TextContent,
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

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
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
  server.tool(
    "elasticsearch_get_nodes_info",
    "Get node information (static configuration). WARNING: Full info exceeds 1MB per node. SAFE OPTIONS: {metric: 'name'} for node list, {metric: 'os,jvm'} for basic info, {metric: 'process,transport'} for network info. The 'compact' parameter auto-selects essential metrics. NEVER use empty {} - it will fail. READ operation - safe for production use.",
    nodesInfoSchema,
    nodesInfoHandler,
  );
};
