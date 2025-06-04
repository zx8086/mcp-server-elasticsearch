/* src/tools/core/search.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolFunction, ToolParams, SearchResult, TextContent } from "../types.js";

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

export const registerSearchTool: ToolFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_search",
    "Perform full-text search in Elasticsearch using Query DSL. Best for text search, fuzzy matching, aggregations, analytics, relevance scoring. Use when you need powerful search and analytics capabilities on JSON documents. Highlights are always enabled.",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to search for documents"),
      queryBody: z
        .record(z.any())
        .refine(
          (val) => {
            try {
              JSON.parse(JSON.stringify(val));
              return true;
            } catch (e) {
              return false;
            }
          },
          {
            message: "queryBody must be a valid Elasticsearch query DSL object",
          },
        )
        .describe(
          "Complete Elasticsearch Query DSL object for full-text search, filtering, aggregations, and sorting. Use this for complex search operations with relevance scoring.",
        ),
    },
    async ({ index, queryBody }: ToolParams): Promise<SearchResult> => {
      try {
        logger.debug("Searching index", { index, queryBody } as const);
        let indexMappings: { properties?: Record<string, { type: string }> } = {};
        try {
          const mappingResponse = await esClient.indices.getMapping({ index }) as MappingResponse;
          indexMappings = mappingResponse[index as string]?.mappings || {};
        } catch (mappingError) {
          logger.warn("Could not retrieve mappings for highlighting", {
            mappingError,
          });
        }
        const typedQueryBody = queryBody as SearchQueryBody;
        let searchRequest = { index, ...typedQueryBody };
        if (indexMappings.properties) {
          const textFields: Record<string, any> = {};
          for (const [fieldName, fieldData] of Object.entries(
            indexMappings.properties,
          )) {
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
        const from = typedQueryBody.from || 0;
        if (typedQueryBody.size === 0 || typedQueryBody.aggs) {
          return {
            content: [
              { type: "text", text: `Search results with aggregations:` } as TextContent,
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
            if (
              highlights &&
              Array.isArray(highlights) &&
              highlights.length > 0
            ) {
              content += `${field} (highlighted): ${highlights.join(" ... ")}\n`;
            }
          }
          for (const [field, value] of Object.entries(sourceData)) {
            if (!(field in highlightedFields)) {
              content += `${field}: ${JSON.stringify(value)}\n`;
            }
          }
          return { type: "text", text: content.trim() } as TextContent;
        });
        const totalHits =
          typeof result.hits.total === "number"
            ? result.hits.total
            : result.hits.total?.value || 0;
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
