/* src/tools/core/search.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

interface MappingResponse {
  [key: string]: {
    mappings: {
      properties?: Record<string, { type: string }>;
    };
  };
}

interface SearchQueryBody {
  from?: number;
  size?: number;
  aggs?: any;
  highlight?: {
    fields: Record<string, any>;
    pre_tags: string[];
    post_tags: string[];
  };
  [key: string]: unknown;
}

// Direct JSON Schema definition
const searchSchema = {
  type: "object",
  properties: {
    index: {
      type: "string",
      description: "Name of the Elasticsearch index to search for documents. Use '*' to search all indices. Examples: 'logs-*', 'metrics-*', '*2025.08.16*'"
    },
    queryBody: {
      type: "object",
      description: "Complete Elasticsearch Query DSL object (not 'body', use 'queryBody'). Include query, size, from, aggs, sort, etc. Example: { query: { match_all: {} }, size: 10 }",
      additionalProperties: true
    }
  },
  additionalProperties: false
};

// Zod validator for runtime validation
const searchValidator = z.object({
  index: z.string().trim().min(1).optional(),
  queryBody: z.object({}).passthrough().optional()
});

type SearchParams = z.infer<typeof searchValidator>;

// MCP error handling
function createSearchMcpError(
  error: Error | string,
  context: {
    type: 'validation' | 'execution' | 'index_not_found' | 'query_parsing';
    details?: any;
  }
): McpError {
  const message = error instanceof Error ? error.message : error;
  
  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    query_parsing: ErrorCode.InvalidParams
  };
  
  return new McpError(
    errorCodeMap[context.type],
    `[elasticsearch_search] ${message}`,
    context.details
  );
}

// Tool implementation
export const registerSearchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  
  const searchHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();
    
    try {
      // Validate parameters
      const params = searchValidator.parse(args);
      const { index, queryBody } = params;

      logger.debug("Searching index", { index, queryBody });
      
      let indexMappings: { properties?: Record<string, { type: string }> } = {};
      try {
        const mappingResponse = (await esClient.indices.getMapping({ index })) as MappingResponse;
        indexMappings = mappingResponse[index as string]?.mappings || {};
      } catch (mappingError) {
        logger.warn("Could not retrieve mappings for highlighting", {
          mappingError,
        });
      }

      // Handle undefined queryBody - provide default
      const typedQueryBody = (queryBody || { query: { match_all: {} }, size: 10 }) as SearchQueryBody;
      const searchRequest = { index: index || "*", ...typedQueryBody };
      
      if (indexMappings.properties) {
        const textFields: Record<string, any> = {};
        for (const [fieldName, fieldData] of Object.entries(indexMappings.properties)) {
          if (
            fieldData.type === "text" ||
            fieldData.type === "search_as_you_type" ||
            fieldData.type === "match_only_text"
          ) {
            textFields[fieldName] = {
              pre_tags: ["<em>"],
              post_tags: ["</em>"],
              fragment_size: 150,
              number_of_fragments: 3,
            };
          }
        }
        if (Object.keys(textFields).length > 0) {
          searchRequest.highlight = {
            fields: textFields,
            pre_tags: ["<em>"],
            post_tags: ["</em>"],
          };
        }
      }
      
      const result = await esClient.search(searchRequest, {
        opaqueId: "elasticsearch_search",
      });

      // Safe property access to avoid undefined errors
      const from = typedQueryBody?.from ?? 0;
      const size = typedQueryBody?.size;
      const hasAggregations = typedQueryBody?.aggs || result.aggregations;

      // Handle aggregation-only queries (size=0) or queries with aggregations
      if (size === 0 || hasAggregations) {
        return {
          content: [
            { type: "text", text: "Search results with aggregations:" } as TextContent,
            {
              type: "text",
              text: JSON.stringify(result.aggregations || {}, null, 2),
            } as TextContent,
          ],
        };
      }
      
      const contentFragments = result.hits.hits.map((hit) => {
        const highlightedFields = hit.highlight || {};
        const sourceData = hit._source || {};
        let content = `Document ID: ${hit._id}\nScore: ${hit._score}\n\n`;
        
        for (const [field, highlights] of Object.entries(highlightedFields)) {
          if (highlights && Array.isArray(highlights) && highlights.length > 0) {
            content += `${field} (highlighted): ${highlights.join(" ... ")}\n`;
          }
        }
        
        for (const [field, value] of Object.entries(sourceData)) {
          if (!(field in highlightedFields)) {
            // Format value based on type - avoid double-stringifying
            let formattedValue: string;
            if (typeof value === "string") {
              formattedValue = value;
            } else if (typeof value === "object" && value !== null) {
              // For objects/arrays, pretty print without extra escaping
              formattedValue = JSON.stringify(value, null, 2);
            } else {
              formattedValue = String(value);
            }
            content += `${field}: ${formattedValue}\n`;
          }
        }
        return { type: "text", text: content.trim() } as TextContent;
      });
      
      const totalHits = typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value || 0;
      const metadataFragment: TextContent = {
        type: "text",
        text: `Total results: ${totalHits}, showing ${result.hits.hits.length} from position ${from}`,
      };

      const duration = performance.now() - perfStart;
      if (duration > 10000) {
        logger.warn("Slow search operation", { duration });
      }

      return {
        content: [metadataFragment, ...contentFragments],
      };

    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createSearchMcpError(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`, {
          type: 'validation',
          details: { validationErrors: error.errors, providedArgs: args }
        });
      }

      if (error instanceof Error) {
        if (error.message.includes('index_not_found_exception')) {
          throw createSearchMcpError(`Index not found: ${args?.index || '*'}`, {
            type: 'index_not_found',
            details: { originalError: error.message }
          });
        }

        if (error.message.includes('parsing_exception') || error.message.includes('query_shard_exception')) {
          throw createSearchMcpError(`Query parsing failed: ${error.message}`, {
            type: 'query_parsing',
            details: { query: args?.queryBody }
          });
        }
      }

      throw createSearchMcpError(error instanceof Error ? error.message : String(error), {
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
    "elasticsearch_search",
    "Search Elasticsearch with Query DSL. Uses direct JSON Schema and standardized MCP error codes. TIP: Always set 'size' in queryBody (default is only 10). For aggregations use {size: 0, aggs: {...}}. For large result sets (>100), consider pagination with 'from' and 'size'. Example: {index: 'logs-*', queryBody: {query: {match_all: {}}, size: 50, from: 0}}",
    searchSchema,
    searchHandler
  );
};