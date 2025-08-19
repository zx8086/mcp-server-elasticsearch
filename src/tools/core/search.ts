/* src/tools/core/search.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolFunction, ToolParams } from "../types.js";

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

const SearchParams = z.object({
  index: z
    .string()
    .trim()
    .min(1, "Index name is required")
    .optional()
    .describe(
      "Name of the Elasticsearch index to search for documents. Use '*' to search all indices. Examples: 'logs-*', 'metrics-*', '*2025.08.16*'",
    ),
  queryBody: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      "Complete Elasticsearch Query DSL object (not 'body', use 'queryBody'). Include query, size, from, aggs, sort, etc. Example: { query: { match_all: {} }, size: 10 }",
    ),
});

type SearchParamsType = z.infer<typeof SearchParams>;

export const registerSearchTool: ToolFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_search",
    "Search Elasticsearch with Query DSL. TIP: Always set 'size' in queryBody (default is only 10). For aggregations use {size: 0, aggs: {...}}. For large result sets (>100), consider pagination with 'from' and 'size'. Example: {index: 'logs-*', queryBody: {query: {match_all: {}}, size: 50, from: 0}}",
    SearchParams,
    async ({ index, queryBody }: SearchParamsType): Promise<SearchResult> => {
      try {
        logger.debug("Searching index", { index, queryBody } as const);
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
        return {
          content: [metadataFragment, ...contentFragments],
        };
      } catch (error) {
        logger.error("Search failed:", {
          error: error instanceof Error ? error.message : String(error),
        } as const);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            } as TextContent,
          ],
        };
      }
    },
  );
};
