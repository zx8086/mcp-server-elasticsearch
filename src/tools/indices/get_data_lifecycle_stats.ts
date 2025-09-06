/* src/tools/indices/get_data_lifecycle_stats.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition - This tool has no parameters according to the API documentation
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation (empty object)
const getDataLifecycleStatsValidator = z.object({});

type GetDataLifecycleStatsParams = z.infer<typeof getDataLifecycleStatsValidator>;

// MCP error handling
function createGetDataLifecycleStatsMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "feature_not_available";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    feature_not_available: ErrorCode.MethodNotAllowed,
  };

  return new McpError(
    errorCodeMap[context.type],
    `[elasticsearch_get_data_lifecycle_stats] ${message}`,
    context.details,
  );
}

// Tool implementation
export const registerGetDataLifecycleStatsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const getDataLifecycleStatsHandler = async (args: any): Promise<SearchResult> => {
    try {
      // Validate parameters (should be empty)
      const _params = getDataLifecycleStatsValidator.parse(args);

      logger.debug("Getting data lifecycle stats");

      const result = await esClient.indices.getDataLifecycleStats(
        {},
        {
          opaqueId: "elasticsearch_get_data_lifecycle_stats",
        },
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createGetDataLifecycleStatsMcpError(
          `Validation failed: ${error.errors.map((e) => e.message).join(", ")}`,
          {
            type: "validation",
            details: { validationErrors: error.errors, providedArgs: args },
          },
        );
      }

      if (error instanceof Error) {
        if (error.message.includes("feature_not_supported") || error.message.includes("not_implemented")) {
          throw createGetDataLifecycleStatsMcpError(`Data lifecycle feature not available: ${error.message}`, {
            type: "feature_not_available",
            details: { originalError: error.message },
          });
        }
      }

      throw createGetDataLifecycleStatsMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: { args },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_get_data_lifecycle_stats",
    "Get data stream lifecycle statistics from Elasticsearch. Best for data stream monitoring, lifecycle analysis, storage planning. Use when you need to track data stream lifecycle management and retention policies in Elasticsearch.",
  {

  },
    getDataLifecycleStatsHandler,
  );
};
