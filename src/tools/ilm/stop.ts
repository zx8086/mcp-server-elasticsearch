/* src/tools/ilm/stop.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

/* SIMPLIFIED VERSION: Direct JSON Schema + MCP Error Codes */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// =============================================================================
// 1. SIMPLIFIED SCHEMA APPROACH
// =============================================================================

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Simple Zod validator for runtime validation only
const stopValidator = z.object({
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type _StopParams = z.infer<typeof stopValidator>;

// =============================================================================
// 2. STANDARDIZED MCP ERROR HANDLING
// =============================================================================

function createIlmStopMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "permission" | "not_running";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    permission: ErrorCode.InvalidRequest,
    not_running: ErrorCode.InvalidRequest,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_ilm_stop] ${message}`, context.details);
}

// =============================================================================
// 3. SIMPLIFIED TOOL IMPLEMENTATION
// =============================================================================

export const registerStopTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const stopHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Simple validation - no complex parameter extraction
      const params = stopValidator.parse(args);

      logger.debug("Stopping ILM", {
        masterTimeout: params.masterTimeout,
        timeout: params.timeout,
      });

      const result = await esClient.ilm.stop({
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow ILM operation: stop", { duration });
      }

      logger.info("ILM stopped successfully");

      // MCP-compliant success response
      return {
        content: [
          {
            type: "text",
            text: `⏹️ **ILM Stopped Successfully**

Index Lifecycle Management has been stopped. All automated policy operations are now halted.

⚠️ **Important**: ILM policies will not execute while stopped. Use \`elasticsearch_ilm_start\` to resume operations.

Operation completed at: ${new Date().toISOString()}`,
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                acknowledged: result.acknowledged || true,
                operation: "stop_ilm",
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      // Standardized MCP error handling
      if (error instanceof z.ZodError) {
        throw createIlmStopMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("security_exception")) {
          throw createIlmStopMcpError("Insufficient permissions to stop ILM", {
            type: "permission",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("not_running") || error.message.includes("already stopped")) {
          throw createIlmStopMcpError("ILM is already stopped", {
            type: "not_running",
            details: { suggestion: "Use get_status to check current ILM state" },
          });
        }
      }

      throw createIlmStopMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Direct tool registration with JSON Schema + read-only protection
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_ilm_stop",

    {
      title: "Ilm Stop",

      description:
        "Stop ILM. Stop the Index Lifecycle Management plugin to halt automated operations. Uses direct JSON Schema and standardized MCP error codes. Examples: {} (no params needed), {masterTimeout: 30s}.",

      inputSchema: {
        masterTimeout: z.string().optional(), // Master node timeout
        timeout: z.string().optional(), // Request timeout
      },
    },

    // Direct JSON Schema - no Zod conversion
    withReadOnlyCheck("elasticsearch_ilm_stop", stopHandler, OperationType.WRITE),
  );
};
