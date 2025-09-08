/* src/tools/search/scroll_search.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const scrollSearchSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      minLength: 1,
      description: "Index name or pattern to search",
    },
    query: {
      type: "object",
      additionalProperties: true,
      description: "Query DSL to filter documents",
    },
    scroll: {
      type: "string",
    },
    scrollId: {
      type: "string",
    },
    maxDocuments: {
      type: "number",
    },
    restTotalHitsAsInt: {
      type: "boolean",
    },
  },
  required: ["index", "query"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const scrollSearchValidator = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  query: z.object({}).passthrough(),
  scroll: z.string().optional(),
  scrollId: z.string().optional(),
  maxDocuments: z.number().optional(),
  restTotalHitsAsInt: booleanField().optional(),
});

type ScrollSearchParams = z.infer<typeof scrollSearchValidator>;

// MCP error handling
function createScrollSearchMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_scroll_search] ${message}`, context.details);
}

// Tool implementation
export const registerScrollSearchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const scrollSearchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = scrollSearchValidator.parse(args);

      // If scrollId is provided, use the traditional scroll API
      if (params.scrollId) {
        const result = await esClient.scroll(
          {
            scroll_id: params.scrollId,
            scroll: params.scroll,
            rest_total_hits_as_int: params.restTotalHitsAsInt,
          },
          {
            opaqueId: "elasticsearch_scroll_search",
          },
        );

        const duration = performance.now() - perfStart;
        if (duration > 5000) {
          logger.warn("Slow operation", { duration });
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // Otherwise, use the helper API for better memory management
      const documents = [];
      let count = 0;

      const scrollSearch = esClient.helpers.scrollSearch({
        index: params.index,
        query: params.query,
        scroll: params.scroll,
      });

      for await (const result of scrollSearch) {
        for (const doc of result.documents) {
          documents.push(doc);
          count++;

          if (params.maxDocuments && count >= params.maxDocuments) {
            await result.clear();
            break;
          }
        }

        if (params.maxDocuments && count >= params.maxDocuments) {
          break;
        }
      }

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation", { duration });
      }

      return {
        content: [
          { type: "text", text: `Retrieved ${documents.length} documents` },
          { type: "text", text: JSON.stringify(documents, null, 2) },
        ],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createScrollSearchMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createScrollSearchMcpError(error instanceof Error ? error.message : String(error), {
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

    "elasticsearch_scroll_search",

    {

      title: "Scroll Search",

      description: "Perform scroll search in Elasticsearch for large result sets. Best for pagination, large dataset retrieval, memory-efficient iteration. Use when you need to retrieve all documents from large result sets without overwhelming memory in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: scrollSearchSchema,

    },

    scrollSearchHandler,

  );
};
