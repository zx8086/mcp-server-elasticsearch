/* src/tools/core/search.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { notificationManager, createProgressTracker, withNotificationContext } from "../../utils/notifications.js";
import { createTextContent, createSearchMetadata } from "../../utils/mcpAnnotations.js";
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

    // Create progress tracker for the search operation
    const progressTracker = await createProgressTracker(
      "elasticsearch_search",
      100,
      `Elasticsearch search on ${params?.index || "*"}`
    );

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

      // Send initial notification
      await notificationManager.sendInfo("Starting Elasticsearch search operation", {
        tool: "elasticsearch_search",
        index: params?.index || "*",
        hasQuery: !!params?.query,
        hasAggregations: !!params?.aggs,
        expectedSize: params?.size || 10,
      });

      await progressTracker.updateProgress(10, "Validating and parsing search parameters");

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
        
        await notificationManager.sendInfo("Time range query detected", {
          timeRange: rangeQuery,
          currentTime: new Date().toISOString(),
        });
      }

      await progressTracker.updateProgress(25, "Retrieving index mappings for highlighting configuration");

      let indexMappings: { properties?: Record<string, { type: string }> } = {};
      try {
        const mappingResponse = (await esClient.indices.getMapping({ index })) as MappingResponse;
        indexMappings = mappingResponse[index as string]?.mappings || {};
        await progressTracker.updateProgress(35, "Index mappings retrieved successfully");
      } catch (mappingError) {
        logger.warn("Could not retrieve mappings for highlighting", {
          mappingError,
        });
        await notificationManager.sendWarning("Could not retrieve index mappings", {
          error: mappingError instanceof Error ? mappingError.message : String(mappingError),
          impact: "Highlighting may be disabled",
        });
        await progressTracker.updateProgress(35, "Index mappings retrieval failed (non-critical)");
      }

      await progressTracker.updateProgress(45, "Building search query and request parameters");

      // Ensure we have a valid query - handle empty objects correctly
      const isEmptyQuery = !query || (typeof query === "object" && Object.keys(query).length === 0);
      const finalQuery = isEmptyQuery ? { match_all: {} } : query;

      if (isEmptyQuery) {
        await notificationManager.sendInfo("Using match_all query", {
          reason: "No query provided or empty query object",
        });
      }

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

      // Check for potentially expensive operations
      const isLargeRequest = (size ?? 10) > 1000;
      const hasComplexAggregations = aggs && Object.keys(aggs).length > 3;
      const isWildcardSearch = (index || "*") === "*" || (index || "").includes("*");

      if (isLargeRequest) {
        await notificationManager.sendWarning("Large result set requested", {
          requestedSize: size,
          recommendation: "Consider using scroll API for large result sets",
        });
      }

      if (hasComplexAggregations) {
        await notificationManager.sendInfo("Complex aggregations detected", {
          aggregationCount: Object.keys(aggs!).length,
          note: "This may increase query execution time",
        });
      }

      if (isWildcardSearch) {
        await notificationManager.sendInfo("Wildcard index search", {
          pattern: index || "*",
          note: "Searching across multiple indices",
        });
      }

      // DEBUG: Log the exact request being sent to Elasticsearch
      logger.debug("EXACT Elasticsearch request:", JSON.stringify(searchRequest, null, 2));

      await progressTracker.updateProgress(55, "Search request prepared, configuring highlighting");

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
          await progressTracker.updateProgress(65, `Configured highlighting for ${Object.keys(textFields).length} text fields`);
        } else {
          await progressTracker.updateProgress(65, "No text fields found for highlighting");
        }
      }

      await progressTracker.updateProgress(70, "Executing search query against Elasticsearch");
      
      // Send notification before the potentially long-running search
      await notificationManager.sendInfo("Executing search query", {
        index: searchRequest.index,
        queryType: isEmptyQuery ? "match_all" : "custom",
        size: searchRequest.size,
        hasAggregations: !!searchRequest.aggs,
        note: "This may take several seconds for large datasets",
      });

      const result = await esClient.search(searchRequest, {
        opaqueId: "elasticsearch_search",
      });

      await progressTracker.updateProgress(85, `Search completed in ${result.took}ms, processing results`);

      // Safe property access to avoid undefined errors
      const fromOffset = from ?? 0;
      const sizeLimit = size;
      const hasAggregations = aggs || result.aggregations;

      // Handle aggregation-only queries (size=0) - only return aggregations if explicitly no documents wanted
      if (sizeLimit === 0) {
        const totalHits = typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value || 0;
        const duration = performance.now() - perfStart;
        
        const searchMetadata = createSearchMetadata({
          totalResults: totalHits,
          returnedResults: 0,
          executionTimeMs: Math.round(duration),
          elasticsearchTimeMs: result.took,
          queryType: isEmptyQuery ? "match_all" : "custom",
          index: index || "*",
          hasAggregations: true,
          fromOffset: from ?? 0,
        });

        return {
          content: [
            createTextContent(
              `Search results with aggregations (${totalHits} total hits, ${result.took}ms):`,
              searchMetadata
            ),
            createTextContent(
              JSON.stringify(result.aggregations || {}, null, 2),
              { operation: "aggregations", timestamp: new Date().toISOString() }
            ),
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
      
      await progressTracker.updateProgress(95, "Formatting search results for display");

      const duration = performance.now() - perfStart;
      
      // Create comprehensive search metadata
      const searchMetadata = createSearchMetadata({
        totalResults: totalHits,
        returnedResults: result.hits.hits.length,
        executionTimeMs: Math.round(duration),
        elasticsearchTimeMs: result.took,
        queryType: isEmptyQuery ? "match_all" : "custom",
        index: index || "*",
        hasAggregations: !!result.aggregations,
        fromOffset,
      });

      // Performance and result notifications
      const resultMetrics = {
        totalHits,
        returnedDocuments: result.hits.hits.length,
        executionTime: duration,
        elasticsearchTime: result.took,
        hasAggregations: !!result.aggregations,
        fromOffset,
      };

      if (duration > 10000) {
        await notificationManager.sendWarning("Slow search operation detected", {
          totalDuration: `${Math.round(duration)}ms`,
          elasticsearchTime: `${result.took}ms`,
          recommendation: "Consider optimizing query or adding indices",
        });
      }

      // Create enhanced content with metadata
      const metadataFragment = createTextContent(
        `Total results: ${totalHits}, showing ${result.hits.hits.length} from position ${fromOffset}`,
        searchMetadata
      );

      // Enhanced content fragments for documents
      const enhancedContentFragments = contentFragments.map(fragment => 
        createTextContent(fragment.text, {
          operation: "document_result",
          timestamp: new Date().toISOString(),
          audience: ["user"],
        })
      );

      // Build response content with enhanced items
      const responseContent = [metadataFragment, ...enhancedContentFragments];

      if (hasAggregations && result.aggregations) {
        const aggregationsFragment = createTextContent(
          `\n=== AGGREGATIONS ===\n${JSON.stringify(result.aggregations, null, 2)}`,
          {
            operation: "aggregations",
            hasAggregations: true,
            timestamp: new Date().toISOString(),
            audience: ["user"],
          }
        );
        responseContent.push(aggregationsFragment);
        await progressTracker.updateProgress(98, "Added aggregation results to response");
      }

      // Complete the operation with comprehensive metrics
      await progressTracker.complete(resultMetrics, 
        `Search completed: ${totalHits} total hits, ${result.hits.hits.length} returned in ${Math.round(duration)}ms`
      );

      // Send final success notification
      await notificationManager.sendInfo("Elasticsearch search completed successfully", {
        ...resultMetrics,
        performance: duration < 1000 ? "excellent" : duration < 5000 ? "good" : duration < 15000 ? "acceptable" : "slow",
      });

      return {
        content: responseContent,
      };
    } catch (error) {
      // Fail the progress tracker and send error notifications
      const duration = performance.now() - perfStart;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await progressTracker.fail(error instanceof Error ? error : new Error(errorMessage), 
        `Search failed after ${Math.round(duration)}ms`
      );

      // Send detailed error notification
      await notificationManager.sendError("Elasticsearch search failed", error instanceof Error ? error : errorMessage, {
        tool: "elasticsearch_search",
        duration: Math.round(duration),
        index: params?.index || "*",
        hasQuery: !!params?.query,
      });

      // Error handling - JSON parsing errors
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        throw createSearchMcpError(`JSON parsing failed: ${error.message}`, {
          type: "validation",
          details: { originalError: error.message, providedParams: params },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("index_not_found_exception")) {
          await notificationManager.sendError("Index not found", error, {
            searchedIndex: params?.index || "*",
            suggestion: "Verify index name and ensure it exists",
          });
          
          throw createSearchMcpError(`Index not found: ${params?.index || "*"}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("parsing_exception") || error.message.includes("query_shard_exception")) {
          await notificationManager.sendError("Query parsing failed", error, {
            providedQuery: params?.query,
            suggestion: "Check query syntax and field names",
          });
          
          throw createSearchMcpError(`Query parsing failed: ${error.message}`, {
            type: "query_parsing",
            details: { query: params?.query },
          });
        }
      }

      throw createSearchMcpError(errorMessage, {
        type: "execution",
        details: {
          duration,
          params,
        },
      });
    }
  };

  // Tool registration using modern registerTool method
  server.registerTool(
    "elasticsearch_search",
    {
      title: "Search Elasticsearch",
      description: "Search Elasticsearch with natural Query DSL parameters. Supports both document search and analytics. Parameters: query (filter), size (document count), from (pagination), sort, aggs (analytics), _source (fields), highlight. Use size=0 for pure analytics, size=10+ for documents. Both documents and aggregations can be returned together. Example: {index: 'logs-*', query: {range: {'@timestamp': {gte: 'now-24h'}}}, size: 50, aggs: {hourly: {date_histogram: {field: '@timestamp', fixed_interval: '1h'}}}}",
      inputSchema: SearchParams.shape,
    },
    withNotificationContext(searchHandler),
  );
};
