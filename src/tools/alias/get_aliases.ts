import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetAliasesTool(server, esClient) {
  server.tool(
    "get_aliases",
    "Get aliases for indices in Elasticsearch",
    {
      index: z.string().optional(),
      name: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.string().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.indices.getAlias({
          index: params.index,
          name: params.name,
          ignore_unavailable: params.ignoreUnavailable,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
        }, {
          opaqueId: 'get_aliases'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get aliases:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 