/* src/tools/search/clear_scroll.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Zod validator for runtime validation
const clearScrollValidator = z.object({
  scrollId: z.string().min(1, "Scroll ID cannot be empty"),
});

type _ClearScrollParams = z.infer<typeof clearScrollValidator>;

// MCP error handling
function createClearScrollMcpError(
  error: Error | string,
  context: { type: "validation" | "execution"; details?: any },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_clear_scroll] ${message}`, context.details);
}

// Tool implementation
export const registerClearScrollTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const clearScrollHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = clearScrollValidator.parse(args);

      const result = await esClient.clearScroll({
        scroll_id: params.scrollId,
      });

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createClearScrollMcpError(`Validation failed: ${error.issues.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.issues, providedArgs: args },
        });
      }

      throw createClearScrollMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_clear_scroll",

    {
      title: "Clear Scroll",

      description:
        "Clear a scroll context in Elasticsearch to free resources. Best for cleanup operations, memory management, scroll lifecycle management. Use when you need to explicitly release scroll contexts after completing large result set iterations in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: {
        scrollId: z.string(), // Scroll ID to clear from memory
      },
    },

    clearScrollHandler,
  );
};
