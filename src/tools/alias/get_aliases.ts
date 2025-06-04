/* src/tools/alias/get_aliases.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const GetAliasesParams = z.object({
  index: z.string().optional(),
  name: z.string().optional(),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .optional(),
});

type GetAliasesParamsType = z.infer<typeof GetAliasesParams>;
export const registerGetAliasesTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_get_aliases",
    "Get index aliases from Elasticsearch. Best for alias discovery, configuration review, index mapping analysis. Use when you need to inspect alias configurations and their associated indices in Elasticsearch.",
    {
      index: z.string().optional(),
      name: z.string().optional(),
      ignoreUnavailable: z.boolean().optional(),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z
        .enum(["all", "open", "closed", "hidden", "none"])
        .optional(),
    },
    async (params: GetAliasesParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.getAlias(
          {
            index: params.index,
            name: params.name,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards,
          },
          {
            opaqueId: "elasticsearch_get_aliases",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get aliases:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
};
