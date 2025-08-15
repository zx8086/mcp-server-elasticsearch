/* src/tools/search/count_documents.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const CountDocumentsParams = z.object({
  index: z.string().optional(),
  query: z.record(z.any()).optional(),
  analyzer: z.string().optional(),
  analyzeWildcard: z.boolean().optional(),
  defaultOperator: z.enum(["AND", "OR"]).optional(),
  df: z.string().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  ignoreThrottled: z.boolean().optional(),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  minScore: z.number().optional(),
  preference: z.string().optional(),
  routing: z.string().optional(),
  q: z.string().optional(),
  terminateAfter: z.number().optional(),
});

type CountDocumentsParamsType = z.infer<typeof CountDocumentsParams>;
export const registerCountDocumentsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_count_documents",
    "Count documents in Elasticsearch using query criteria. Best for data analysis, result set sizing, query validation. Use when you need to get document counts without retrieving actual documents from Elasticsearch indices.",
    {
      index: z.string().optional(),
      query: z.record(z.any()).optional(),
      analyzer: z.string().optional(),
      analyzeWildcard: z.boolean().optional(),
      defaultOperator: z.enum(["AND", "OR"]).optional(),
      df: z.string().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
      ignoreThrottled: z.boolean().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      minScore: z.number().optional(),
      preference: z.string().optional(),
      routing: z.string().optional(),
      q: z.string().optional(),
      terminateAfter: z.number().optional(),
    },
    async (params: CountDocumentsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.count(
          {
            index: params.index,
            query: params.query,
            analyzer: params.analyzer,
            analyze_wildcard: params.analyzeWildcard,
            default_operator: params.defaultOperator,
            df: params.df,
            expand_wildcards: params.expandWildcards,
            ignore_throttled: params.ignoreThrottled,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            min_score: params.minScore,
            preference: params.preference,
            routing: params.routing,
            q: params.q,
            terminate_after: params.terminateAfter,
          },
          {
            opaqueId: "elasticsearch_count_documents",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to count documents:", {
          error: error instanceof Error ? error.message : String(error),
        });
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
