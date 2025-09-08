/* src/tools/ilm/get_status.ts */
/* SIMPLIFIED VERSION: Direct JSON Schema + MCP Error Codes */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// =============================================================================
// 1. SIMPLIFIED SCHEMA APPROACH
// =============================================================================

// Direct JSON Schema definition (no parameters needed)
const getStatusSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

// =============================================================================
// 2. STANDARDIZED MCP ERROR HANDLING
// =============================================================================

function createIlmStatusMcpError(
  error: Error | string,
  context: {
    type: "execution" | "permission";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    execution: ErrorCode.InternalError,
    permission: ErrorCode.InvalidRequest,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_ilm_get_status] ${message}`, context.details);
}

// =============================================================================
// 3. SIMPLIFIED TOOL IMPLEMENTATION
// =============================================================================

export const registerGetStatusTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getStatusHandler = async (_args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      logger.debug("Getting ILM status");

      const result = await esClient.ilm.getStatus(
        {},
        {
          opaqueId: "elasticsearch_ilm_get_status",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow ILM operation: get_status", { duration });
      }

      // Enhanced response with status interpretation
      const status = result.operation_mode || "unknown";
      const isEnabled = status === "RUNNING";

      const summary = {
        ilm_status: status,
        is_running: isEnabled,
        operation_mode: result.operation_mode,
        ...(result.policy_count !== undefined && { policy_count: result.policy_count }),
        timestamp: new Date().toISOString(),
      };

      // MCP-compliant response with both summary and raw data
      return {
        content: [
          {
            type: "text",
            text: `## ILM Status: ${isEnabled ? "✅ RUNNING" : `❌ ${status}`}

**Operation Mode**: ${result.operation_mode || "unknown"}
${result.policy_count !== undefined ? `**Policy Count**: ${result.policy_count}` : ""}

Status checked at: ${new Date().toISOString()}`,
          },
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error) {
      // Standardized MCP error handling
      if (error instanceof Error) {
        if (error.message.includes("security_exception")) {
          throw createIlmStatusMcpError("Insufficient permissions to check ILM status", {
            type: "permission",
            details: { originalError: error.message },
          });
        }
      }

      throw createIlmStatusMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
        },
      });
    }
  };

  // Direct tool registration with JSON Schema
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_ilm_get_status",

    {

      title: "Ilm Get Status",

      description: "Get ILM status. Check if Index Lifecycle Management is running and operational. Uses direct JSON Schema and standardized MCP error codes. No parameters required.",

      inputSchema: getStatusSchema,

    },

    // Direct JSON Schema
    getStatusHandler,

  );
};
