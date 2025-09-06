/* src/tools/indices/explain_data_lifecycle.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const explainDataLifecycleValidator = z.object({
  index: z.union([z.string(), z.array(z.string())]),
  includeDefaults: booleanField().optional(),
  masterTimeout: z.string().optional(),
});

type ExplainDataLifecycleParams = z.infer<typeof explainDataLifecycleValidator>;

// MCP error handling
function createExplainDataLifecycleMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "index_not_found" | "lifecycle_not_found" | "timeout";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    lifecycle_not_found: ErrorCode.InvalidParams,
    timeout: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_explain_data_lifecycle] ${message}`, context.details);
}

// Tool implementation
export const registerExplainDataLifecycleTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const explainDataLifecycleHandler = async (args: any): Promise<SearchResult> => {
    try {
      // Validate parameters
      const params = explainDataLifecycleValidator.parse(args);

      logger.debug("Explaining data lifecycle", { index: params.index });

      const result = await esClient.indices.explainDataLifecycle(
        {
          index: params.index,
          include_defaults: params.includeDefaults,
          master_timeout: params.masterTimeout,
        },
        {
          opaqueId: "elasticsearch_explain_data_lifecycle",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createExplainDataLifecycleMcpError(
          `Validation failed: ${error.errors.map((e) => e.message).join(", ")}`,
          {
            type: "validation",
            details: { validationErrors: error.errors, providedArgs: args },
          },
        );
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          throw createExplainDataLifecycleMcpError(`Index not found: ${args?.index}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("lifecycle_not_found") || error.message.includes("no data lifecycle")) {
          throw createExplainDataLifecycleMcpError(`No data lifecycle found for index: ${args?.index}`, {
            type: "lifecycle_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("timeout") || error.message.includes("timed_out")) {
          throw createExplainDataLifecycleMcpError(`Operation timed out: ${error.message}`, {
            type: "timeout",
            details: { originalError: error.message },
          });
        }
      }

      throw createExplainDataLifecycleMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: { args },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_explain_data_lifecycle",
    "Get data stream lifecycle status and execution details in Elasticsearch. Best for lifecycle monitoring, troubleshooting, policy analysis. Use when you need to understand data stream lifecycle execution status and configuration in Elasticsearch.",
    {
      index: z.any(), // Data stream or index name(s) to explain lifecycle for. Examples: 'logs-*', ['stream1', 'stream2']
      includeDefaults: z.boolean().optional(), // Whether to return default values in the response
      masterTimeout: z.string().optional(), // Timeout for connection to master node
    },
    explainDataLifecycleHandler,
  );
};
