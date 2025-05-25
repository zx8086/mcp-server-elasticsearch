/* src/tools/core/search.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolFunction, ToolParams, SearchResult } from "../types.js";

export const registerSearchTool: ToolFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "search",
    "Perform an Elasticsearch search with the provided query DSL. Highlights are always enabled.",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to search"),
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
          }
        )
        .describe(
          "Complete Elasticsearch query DSL object that can include query, size, from, sort, etc."
        ),
    },
    async ({ index, queryBody }: ToolParams): Promise<SearchResult> => {
      try {
        logger.debug("Searching index", { index, queryBody } as const);
        let indexMappings = {};
        try {
          const mappingResponse = await esClient.indices.getMapping({ index });
          indexMappings = mappingResponse[index]?.mappings || {};
        } catch (mappingError) {
          logger.warn("Could not retrieve mappings for highlighting", { mappingError });
        }
        const searchRequest = { index, ...queryBody };
        if (indexMappings.properties) {
          const textFields = {};
          for (const [fieldName, fieldData] of Object.entries(indexMappings.properties)) {
            const fieldDataTyped = fieldData;
            if (
              fieldDataTyped.type === "text" ||
              fieldDataTyped.type === "search_as_you_type" ||
              fieldDataTyped.type === "match_only_text"
            ) {
              textFields[fieldName] = {
                pre_tags: ["<em>"],
                post_tags: ["</em>"],
                fragment_size: 150,
                number_of_fragments: 3
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
          opaqueId: 'search'
        });
        const from = queryBody.from || 0;
        if (queryBody.size === 0 || queryBody.aggs) {
          return {
            content: [
              { type: "text", text: `Search results with aggregations:` },
              { type: "text", text: JSON.stringify(result.aggregations || {}, null, 2) },
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
              content += `${field}: ${JSON.stringify(value)}\n`;
            }
          }
          return { type: "text", text: content.trim() };
        });
        const totalHits = typeof result.hits.total === "number"
          ? result.hits.total
          : result.hits.total?.value || 0;
        const metadataFragment = {
          type: "text",
          text: `Total results: ${totalHits}, showing ${result.hits.hits.length} from position ${from}`,
        };
        return {
          content: [metadataFragment, ...contentFragments],
        };
      } catch (error) {
        logger.error("Search failed:", {
          error: error instanceof Error ? error.message : String(error)
        } as const);
        return {
          content: [
            { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
}; 