/* src/tools/template/multi_search_template.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const multiSearchTemplateSchema = {
  type: "object",
  properties: {
    searches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
      },
      description: "Array of search requests to execute",
    },
    index: {
      type: "string",
      description: "Default index to search if not specified in individual searches",
    },
    maxConcurrentSearches: {
      type: "number",
      description: "Maximum number of concurrent searches",
    },
    ccsMinimizeRoundtrips: {
      type: "boolean",
      description: "Minimize roundtrips for cross-cluster searches",
    },
    restTotalHitsAsInt: {
      type: "boolean",
      description: "Return total hits as integer instead of object",
    },
    typedKeys: {
      type: "boolean",
      description: "Specify whether aggregation names should be prefixed by their type",
    },
  },
  required: ["searches"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const multiSearchTemplateValidator = z.object({
  searches: z.array(z.object({}).passthrough()),
  index: z.string().optional(),
  maxConcurrentSearches: z.number().optional(),
  ccsMinimizeRoundtrips: z.boolean().optional(),
  restTotalHitsAsInt: z.boolean().optional(),
  typedKeys: z.boolean().optional(),
});

type MultiSearchTemplateParams = z.infer<typeof multiSearchTemplateValidator>;

// MCP error handling
function createMultiSearchTemplateMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "template_not_found" | "query_parsing" | "index_not_found";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    template_not_found: ErrorCode.InvalidParams,
    query_parsing: ErrorCode.InvalidParams,
    index_not_found: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_multi_search_template] ${message}`, context.details);
}

// Tool implementation
export const registerMultiSearchTemplateTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const multiSearchTemplateHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = multiSearchTemplateValidator.parse(args);
      const { searches, index, maxConcurrentSearches, ccsMinimizeRoundtrips, restTotalHitsAsInt, typedKeys } = params;

      logger.debug("Executing multi-search template", { searchCount: searches.length, index });

      const result = await esClient.msearchTemplate(
        {
          body: searches,
          index,
          max_concurrent_searches: maxConcurrentSearches,
          ccs_minimize_roundtrips: ccsMinimizeRoundtrips,
          rest_total_hits_as_int: restTotalHitsAsInt,
          typed_keys: typedKeys,
        },
        {
          opaqueId: "elasticsearch_multi_search_template",
        },
      );

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow multi-search template operation", { duration, searchCount: searches.length });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createMultiSearchTemplateMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (
          error.message.includes("resource_not_found_exception") ||
          error.message.includes("template_missing_exception")
        ) {
          throw createMultiSearchTemplateMcpError("Template not found in one or more searches", {
            type: "template_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("parsing_exception") || error.message.includes("query_shard_exception")) {
          throw createMultiSearchTemplateMcpError(`Template parsing failed: ${error.message}`, {
            type: "query_parsing",
            details: { searches: args?.searches },
          });
        }

        if (error.message.includes("index_not_found_exception")) {
          throw createMultiSearchTemplateMcpError(`Index not found: ${args?.index || "one or more search indices"}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }
      }

      throw createMultiSearchTemplateMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration - READ operation
  server.tool(
    "elasticsearch_multi_search_template",
    "Execute multiple search templates in Elasticsearch. Uses direct JSON Schema and standardized MCP error codes. Best for batch search operations, templated queries, performance optimization. Use when you need to run multiple parameterized searches efficiently using Elasticsearch search templates. TIP: Each search in 'searches' array can specify its own template and parameters.",
    multiSearchTemplateSchema,
    multiSearchTemplateHandler,
  );
};
