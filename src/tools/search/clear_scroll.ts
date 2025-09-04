/* src/tools/search/clear_scroll.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const clearScrollSchema = {
  type: "object",
  properties: {
    scrollId: {
      type: "string",
      minLength: 1,
      description: "Scroll ID to clear from memory"
    }
  },
  required: ["scrollId"],
  additionalProperties: false
};

// Zod validator for runtime validation
const clearScrollValidator = z.object({
  scrollId: z.string().min(1, "Scroll ID cannot be empty"),
});

type ClearScrollParams = z.infer<typeof clearScrollValidator>;

// MCP error handling
function createClearScrollMcpError(
  error: Error | string,
  context: { type: string; details?: any }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };
  
  return new McpError(
    errorCodeMap[context.type],
    `[elasticsearch_clear_scroll] ${message}`,
    context.details
  );
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
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) }
        ],
      };

    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createClearScrollMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      throw createClearScrollMcpError(error instanceof Error ? error.message : String(error), {
        type: 'execution',
        details: { 
          duration: performance.now() - perfStart,
          args 
        }
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_clear_scroll",
    "Clear a scroll context in Elasticsearch to free resources. Best for cleanup operations, memory management, scroll lifecycle management. Use when you need to explicitly release scroll contexts after completing large result set iterations in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",
    clearScrollSchema,
    clearScrollHandler
  );
};