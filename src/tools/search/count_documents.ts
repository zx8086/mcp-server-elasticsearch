import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerCountDocumentsTool(server, esClient) {
  server.tool(
    "count_documents",
    "Count documents in Elasticsearch",
    {
      index: z.string().optional(),
      query: z.record(z.any()).optional(),
      analyzer: z.string().optional(),
      analyzeWildcard: z.boolean().optional(),
      defaultOperator: z.string().optional(),
      df: z.string().optional(),
      expandWildcards: z.string().optional(),
      ignoreThrottled: z.boolean().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      minScore: z.number().optional(),
      preference: z.string().optional(),
      routing: z.string().optional(),
      q: z.string().optional(),
      terminateAfter: z.number().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.count({
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
        }, {
          opaqueId: 'count_documents'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to count documents:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 