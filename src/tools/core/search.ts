/* src/tools/core/search.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
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

// Zod schema for Elasticsearch search parameters - OBJECT ONLY format
const SearchParams = z.object({
  index: z
    .string()
    .optional()
    .describe(
      "Name of the Elasticsearch index to search. Use '*' to search all indices. Examples: 'logs-*', 'metrics-*'",
    ),
  query: z
    .object({})
    .passthrough()
    .optional()
    .describe("Elasticsearch query object. Example: { range: { '@timestamp': { gte: 'now-24h' } } }"),
  size: z
    .number()
    .optional()
    .describe(
      "Number of documents to return. Default is 10. Use 0 for pure analytics (aggregations only), 10+ to include documents",
    ),
  from: z.number().optional().describe("Starting offset for pagination. Default is 0"),
  sort: z
    .array(z.object({}).passthrough())
    .optional()
    .describe("Sort order. Example: [{ '@timestamp': { order: 'desc' } }]"),
  aggs: z.object({}).passthrough().optional().describe("Aggregations object for analytics queries"),
  _source: z
    .union([z.array(z.string()), z.boolean(), z.string()])
    .optional()
    .describe("Fields to return in results"),
  highlight: z.object({}).passthrough().optional().describe("Highlight configuration"),
});

type SearchParamsType = z.infer<typeof SearchParams>;

// MCP error handling
function createSearchMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "index_not_found" | "query_parsing";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    index_not_found: ErrorCode.InvalidParams,
    query_parsing: ErrorCode.InvalidParams,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_search] ${message}`, context.details);
}

// Tool implementation
export const registerSearchTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const searchHandler = async (params: SearchParamsType): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // DEBUG: Check what we actually receive
      logger.debug("SEARCH PARAMS DEBUG", {
        paramsExists: !!params,
        paramsType: typeof params,
        paramsKeys: params ? Object.keys(params) : "NO PARAMS",
        hasIndex: !!params?.index,
        hasQuery: !!params?.query,
        hasSize: params?.size !== undefined,
        hasAggs: !!params?.aggs,
        indexValue: params?.index,
        sizeValue: params?.size,
      });

      // Zod has already parsed and transformed the parameters
      const { index, query, size, from, sort, aggs, _source, highlight } = params;

      logger.debug("Parsed search parameters", {
        index,
        queryType: typeof query,
        queryKeys: query && typeof query === "object" ? Object.keys(query) : undefined,
        size,
        from,
        hasAggs: !!aggs,
        hasSort: !!sort,
      });

      // Log warning for potential timestamp issues if range queries are used
      if (query && typeof query === "object" && query.range?.["@timestamp"]) {
        const rangeQuery = query.range["@timestamp"];
        logger.debug("Time range query detected", { rangeQuery, currentTime: new Date().toISOString() });
      }

      let indexMappings: { properties?: Record<string, { type: string }> } = {};
      try {
        const mappingResponse = (await esClient.indices.getMapping({ index })) as MappingResponse;
        indexMappings = mappingResponse[index as string]?.mappings || {};
      } catch (mappingError) {
        logger.warn("Could not retrieve mappings for highlighting", {
          mappingError,
        });
      }

      // Ensure we have a valid query - handle empty objects correctly
      const isEmptyQuery = !query || (typeof query === "object" && Object.keys(query).length === 0);
      const finalQuery = isEmptyQuery ? { match_all: {} } : query;

      // Build search request from natural parameters
      const searchRequest: SearchQueryBody & { index: string } = {
        index: index || "*",
        query: finalQuery,
        size: size ?? 10,
        ...(from !== undefined && { from }),
        ...(sort && { sort }),
        ...(aggs && { aggs }),
        ...(_source !== undefined && { _source }),
        ...(highlight && { highlight }),
      };

      // DEBUG: Log the exact request being sent to Elasticsearch
      logger.debug("🔍 EXACT Elasticsearch request:", JSON.stringify(searchRequest, null, 2));

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
      const fromOffset = from ?? 0;
      const sizeLimit = size;
      const hasAggregations = aggs || result.aggregations;

      // Handle aggregation-only queries (size=0) - only return aggregations if explicitly no documents wanted
      if (sizeLimit === 0) {
        const metadata = {
          totalHits: typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value || 0,
          tookMs: result.took,
          currentTime: new Date().toISOString(),
        };
        return {
          content: [
            {
              type: "text",
              text: `Search results with aggregations (${metadata.totalHits} total hits, ${metadata.tookMs}ms, current time: ${metadata.currentTime}):`,
            } as TextContent,
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
        text: `Total results: ${totalHits}, showing ${result.hits.hits.length} from position ${fromOffset}`,
      };

      const duration = performance.now() - perfStart;
      if (duration > 10000) {
        logger.warn("Slow search operation", { duration });
      }

      // If we have aggregations AND documents, show both
      const responseContent: TextContent[] = [metadataFragment, ...contentFragments];

      if (hasAggregations && result.aggregations) {
        const aggregationsFragment: TextContent = {
          type: "text",
          text: `\n=== AGGREGATIONS ===\n${JSON.stringify(result.aggregations, null, 2)}`,
        };
        responseContent.push(aggregationsFragment);
      }

      return {
        content: responseContent,
      };
    } catch (error) {
      // Error handling - JSON parsing errors
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        throw createSearchMcpError(`JSON parsing failed: ${error.message}`, {
          type: "validation",
          details: { originalError: error.message, providedParams: params },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          throw createSearchMcpError(`Index not found: ${params?.index || "*"}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("parsing_exception") || error.message.includes("query_shard_exception")) {
          throw createSearchMcpError(`Query parsing failed: ${error.message}`, {
            type: "query_parsing",
            details: { query: params?.query },
          });
        }
      }

      throw createSearchMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          params,
        },
      });
    }
  };

  // Tool registration
  server.tool(
    "elasticsearch_search",
    "Search Elasticsearch with natural Query DSL parameters. Supports both document search and analytics. Parameters: query (filter), size (document count), from (pagination), sort, aggs (analytics), _source (fields), highlight. Use size=0 for pure analytics, size=10+ for documents. Both documents and aggregations can be returned together. Example: {index: 'logs-*', query: {range: {'@timestamp': {gte: 'now-24h'}}}, size: 50, aggs: {hourly: {date_histogram: {field: '@timestamp', fixed_interval: '1h'}}}}",
    SearchParams.shape,
    searchHandler,
  );
};
