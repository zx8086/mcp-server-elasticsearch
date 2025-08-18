/* src/utils/enhancedResponseHandler.ts */

import { config } from "../config.js";
import type { SearchResult, TextContent } from "../tools/types.js";
import { logger } from "./logger.js";

export interface PaginationParams {
  from?: number;
  size?: number;
  searchAfter?: any[];
  pitId?: string;
  scrollId?: string;
}

export interface PaginationMetadata {
  total: number;
  returned: number;
  from: number;
  size: number;
  hasMore: boolean;
  nextToken?: string;
  searchAfter?: any[];
  pitId?: string;
  scrollId?: string;
}

export interface ResponseOptions {
  maxSize?: number;
  includeMetadata?: boolean;
  summarize?: boolean;
  filterPaths?: string[];
  excludeFields?: string[];
  truncateArrays?: boolean;
  arrayLimit?: number;
}

export interface EnhancedResponse {
  data: any;
  metadata: {
    originalSize: number;
    finalSize: number;
    truncated: boolean;
    pagination?: PaginationMetadata;
    warnings?: string[];
  };
}

/**
 * Enhanced response handler with automatic pagination and size management
 */
export class EnhancedResponseHandler {
  private readonly maxResponseSize: number;
  private readonly maxArrayItems: number;
  private readonly defaultPageSize: number;
  private readonly maxPageSize: number;
  private readonly autoSummarize: boolean;

  constructor() {
    this.maxResponseSize = config.server.maxResponseSizeBytes;
    this.maxArrayItems = 100;
    this.defaultPageSize = config.server.defaultPageSize;
    this.maxPageSize = config.server.maxPageSize;
    this.autoSummarize = config.server.autoSummarizeLargeResponses;
  }

  /**
   * Process Elasticsearch response with automatic size management
   */
  public processResponse(
    response: any,
    options: ResponseOptions = {},
    paginationParams?: PaginationParams,
  ): EnhancedResponse {
    const originalSize = this.estimateSize(response);
    const warnings: string[] = [];

    // Apply response transformations
    let processedData = response;

    // Handle search responses with hits
    if (response.hits?.hits) {
      processedData = this.processSearchResponse(response, options, paginationParams);
    }
    // Handle aggregation responses
    else if (response.aggregations) {
      processedData = this.processAggregationResponse(response, options);
    }
    // Handle array responses (like cat APIs)
    else if (Array.isArray(response)) {
      processedData = this.processArrayResponse(response, options, paginationParams);
    }
    // Handle object responses
    else if (typeof response === "object" && response !== null) {
      processedData = this.processObjectResponse(response, options);
    }

    // Check final size and truncate if needed
    const finalSize = this.estimateSize(processedData);
    const maxSize = options.maxSize || this.maxResponseSize;

    if (finalSize > maxSize) {
      processedData = this.truncateResponse(processedData, maxSize);
      warnings.push(`Response truncated from ${finalSize} to ${maxSize} bytes`);
    }

    // Build metadata
    const metadata: EnhancedResponse["metadata"] = {
      originalSize,
      finalSize: this.estimateSize(processedData),
      truncated: finalSize > maxSize,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    // Add pagination metadata if applicable
    if (response.hits?.total) {
      const total = typeof response.hits.total === "number" ? response.hits.total : response.hits.total.value;

      metadata.pagination = {
        total,
        returned: response.hits.hits.length,
        from: paginationParams?.from || 0,
        size: paginationParams?.size || this.defaultPageSize,
        hasMore: (paginationParams?.from || 0) + response.hits.hits.length < total,
      };

      // Add continuation tokens if available
      if (paginationParams?.pitId) {
        metadata.pagination.pitId = paginationParams.pitId;
      }
      if (paginationParams?.scrollId) {
        metadata.pagination.scrollId = paginationParams.scrollId;
      }
      if (response.hits.hits.length > 0) {
        const lastHit = response.hits.hits[response.hits.hits.length - 1];
        if (lastHit.sort) {
          metadata.pagination.searchAfter = lastHit.sort;
        }
      }
    }

    return {
      data: processedData,
      metadata,
    };
  }

  /**
   * Process search responses with hits
   */
  private processSearchResponse(response: any, options: ResponseOptions, _paginationParams?: PaginationParams): any {
    const result: any = {
      total: response.hits.total,
      maxScore: response.hits.max_score,
    };

    // Process hits with size limits
    const hits = response.hits.hits || [];
    const maxHits = options.maxSize ? Math.min(hits.length, 100) : hits.length;

    result.hits = hits.slice(0, maxHits).map((hit: any) => {
      const processedHit: any = {
        _id: hit._id,
        _index: hit._index,
        _score: hit._score,
      };

      // Include source with field filtering
      if (hit._source) {
        processedHit._source = this.filterFields(hit._source, options);
      }

      // Include highlights if present
      if (hit.highlight) {
        processedHit.highlight = hit.highlight;
      }

      // Include sort values for pagination
      if (hit.sort) {
        processedHit.sort = hit.sort;
      }

      return processedHit;
    });

    // Include aggregations if present
    if (response.aggregations) {
      result.aggregations = this.processAggregationResponse(
        { aggregations: response.aggregations },
        options,
      ).aggregations;
    }

    // Add continuation hint
    if (hits.length > maxHits) {
      result._truncated = true;
      result._message = `Showing ${maxHits} of ${hits.length} hits. Use pagination to see more.`;
    }

    return result;
  }

  /**
   * Process aggregation responses
   */
  private processAggregationResponse(response: any, options: ResponseOptions): any {
    const result: any = {};

    if (response.aggregations) {
      result.aggregations = this.processAggregations(response.aggregations, options);
    }

    return result;
  }

  /**
   * Process array responses (like cat APIs)
   */
  private processArrayResponse(response: any[], options: ResponseOptions, paginationParams?: PaginationParams): any {
    const from = paginationParams?.from || 0;
    const size = paginationParams?.size || this.defaultPageSize;
    const maxSize = options.maxSize ? Math.min(size, 1000) : size;

    const paginatedItems = response.slice(from, from + maxSize);

    return {
      items: paginatedItems.map((item) => this.filterFields(item, options)),
      total: response.length,
      from,
      size: paginatedItems.length,
      _truncated: response.length > from + maxSize,
    };
  }

  /**
   * Process object responses
   */
  private processObjectResponse(response: any, options: ResponseOptions): any {
    // For objects with many keys (like index listings)
    const keys = Object.keys(response);
    if (keys.length > 100 && options.summarize) {
      const summarized: any = {};
      const limit = 50;

      for (let i = 0; i < Math.min(keys.length, limit); i++) {
        const key = keys[i];
        summarized[key] = this.filterFields(response[key], options);
      }

      if (keys.length > limit) {
        summarized._truncated = true;
        summarized._totalKeys = keys.length;
        summarized._message = `Showing ${limit} of ${keys.length} items`;
      }

      return summarized;
    }

    // Process normally
    return this.filterFields(response, options);
  }

  /**
   * Recursively process aggregations with size limits
   */
  private processAggregations(aggs: any, options: ResponseOptions, depth = 0): any {
    if (depth > 5) return aggs; // Prevent deep recursion

    const processed: any = {};

    for (const [key, value] of Object.entries(aggs)) {
      if (typeof value !== "object" || value === null) {
        processed[key] = value;
        continue;
      }

      const agg = value as any;

      // Handle bucket aggregations
      if (agg.buckets) {
        const buckets = Array.isArray(agg.buckets) ? agg.buckets : Object.values(agg.buckets);
        const maxBuckets = options.arrayLimit || this.maxArrayItems;

        processed[key] = {
          ...agg,
          buckets: buckets.slice(0, maxBuckets).map((bucket: any) => {
            const processedBucket: any = { ...bucket };

            // Recursively process sub-aggregations
            for (const [subKey, subValue] of Object.entries(bucket)) {
              if (typeof subValue === "object" && subValue !== null && (subValue as any).buckets) {
                processedBucket[subKey] = this.processAggregations({ [subKey]: subValue }, options, depth + 1)[subKey];
              }
            }

            return processedBucket;
          }),
        };

        if (buckets.length > maxBuckets) {
          processed[key]._truncated = true;
          processed[key]._totalBuckets = buckets.length;
        }
      } else {
        processed[key] = agg;
      }
    }

    return processed;
  }

  /**
   * Filter fields from an object based on options
   */
  private filterFields(obj: any, options: ResponseOptions): any {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      const limit = options.arrayLimit || this.maxArrayItems;
      if (options.truncateArrays && obj.length > limit) {
        return [...obj.slice(0, limit), `... and ${obj.length - limit} more items`];
      }
      return obj.map((item) => this.filterFields(item, options));
    }

    const filtered: any = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip excluded fields
      if (options.excludeFields?.includes(key)) {
        continue;
      }

      // Handle nested objects
      if (typeof value === "object" && value !== null) {
        filtered[key] = this.filterFields(value, options);
      } else {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Truncate response to fit size limit
   */
  private truncateResponse(data: any, maxSize: number): any {
    const str = JSON.stringify(data);
    if (str.length <= maxSize) {
      return data;
    }

    // Try to truncate intelligently
    if (data.hits?.hits) {
      // Reduce number of hits
      const reducedHits = Math.floor(data.hits.hits.length / 2);
      return this.truncateResponse(
        {
          ...data,
          hits: {
            ...data.hits,
            hits: data.hits.hits.slice(0, reducedHits),
            _truncated: true,
          },
        },
        maxSize,
      );
    }

    if (Array.isArray(data)) {
      // Reduce array size
      const reducedSize = Math.floor(data.length / 2);
      return this.truncateResponse(data.slice(0, reducedSize), maxSize);
    }

    // Last resort: truncate string representation
    const truncated = str.substring(0, maxSize - 100);
    try {
      return {
        _truncated: true,
        _partial: JSON.parse(`${truncated}"}`),
        _message: "Response severely truncated due to size constraints",
      };
    } catch {
      return {
        _truncated: true,
        _message: "Response too large to display",
        _originalSize: str.length,
        _maxSize: maxSize,
      };
    }
  }

  /**
   * Estimate size of object in bytes
   */
  private estimateSize(obj: any): number {
    try {
      return JSON.stringify(obj).length;
    } catch {
      return 0;
    }
  }

  /**
   * Convert enhanced response to MCP SearchResult format
   */
  public toSearchResult(enhancedResponse: EnhancedResponse, options: ResponseOptions = {}): SearchResult {
    const content: TextContent[] = [];

    // Add metadata if requested
    if (options.includeMetadata && enhancedResponse.metadata.pagination) {
      const { pagination } = enhancedResponse.metadata;
      content.push({
        type: "text",
        text: `📊 Results: ${pagination.returned} of ${pagination.total} (from: ${pagination.from}, size: ${pagination.size})${pagination.hasMore ? " - more available" : ""}`,
      });
    }

    // Add warnings if any
    if (enhancedResponse.metadata.warnings) {
      for (const warning of enhancedResponse.metadata.warnings) {
        content.push({
          type: "text",
          text: `⚠️ ${warning}`,
        });
      }
    }

    // Add main data
    content.push({
      type: "text",
      text: JSON.stringify(enhancedResponse.data, null, 2),
    });

    // Add pagination instructions if there are more results
    if (enhancedResponse.metadata.pagination?.hasMore) {
      const { pagination } = enhancedResponse.metadata;
      content.push({
        type: "text",
        text: `\n💡 To get next page, use: from=${pagination.from + pagination.size}, size=${pagination.size}`,
      });

      if (pagination.searchAfter) {
        content.push({
          type: "text",
          text: `Or use search_after: ${JSON.stringify(pagination.searchAfter)}`,
        });
      }
    }

    return { content };
  }
}

// Export singleton instance
export const responseHandler = new EnhancedResponseHandler();
