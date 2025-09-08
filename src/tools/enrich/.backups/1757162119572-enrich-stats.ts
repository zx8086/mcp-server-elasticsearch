/* src/tools/enrich/stats.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const statsSchema = {
  type: "object",
  properties: {
    masterTimeout: {
      type: "string",
      description: "Timeout for master node operations. Examples: '30s', '1m'",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const statsValidator = z.object({
  masterTimeout: z.string().optional(),
});

type StatsParams = z.infer<typeof statsValidator>;

// MCP error handling
function createStatsMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "coordinator_unavailable" | "timeout";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    coordinator_unavailable: ErrorCode.InternalError,
    timeout: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_enrich_stats] ${message}`, context.details);
}

// Tool implementation
export const registerEnrichStatsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const statsHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = statsValidator.parse(args);
      const { masterTimeout } = params;

      logger.debug("Getting enrich stats", { masterTimeout });

      const result = await esClient.enrich.stats({
        master_timeout: masterTimeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow enrich stats operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createStatsMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("timeout") || error.message.includes("timed_out")) {
          throw createStatsMcpError(`Operation timed out: ${error.message}`, {
            type: "timeout",
            details: { duration: performance.now() - perfStart },
          });
        }

        if (error.message.includes("coordinator") || error.message.includes("unavailable")) {
          throw createStatsMcpError(`Enrich coordinator unavailable: ${error.message}`, {
            type: "coordinator_unavailable",
            details: { originalError: error.message },
          });
        }
      }

      throw createStatsMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration - READ operation
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_enrich_stats",

    {

      title: "Enrich Stats",

      description: "Get Elasticsearch enrich coordinator statistics and execution status. Best for performance monitoring, policy tracking, enrichment analysis. Use when you need to monitor enrich policy execution and coordinator performance in Elasticsearch.",

      inputSchema: statsSchema,

    },

    statsHandler,

  );
};
