/* src/tools/alias/get_aliases_improved.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import {
  createPaginationHeader,
  formatAsMarkdown,
  paginateResults,
  responsePresets,
  truncateResponse,
} from "../../utils/responseHandling.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema with pagination support
const GetAliasesParams = z.object({
  index: z.string().optional().describe("Index pattern to filter by"),
  name: z.string().optional().describe("Alias name pattern to filter by"),
  ignoreUnavailable: z.boolean().optional(),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
  // New pagination and response control parameters
  limit: z.number().min(1).max(100).default(20).describe("Maximum number of aliases to return (default: 20, max: 100)"),
  summary: z.boolean().default(true).describe("Return summarized alias information instead of full details"),
  sortBy: z.enum(["name", "index_count", "alias_name"]).default("name").describe("Sort aliases by specified field"),
});

type GetAliasesParamsType = z.infer<typeof GetAliasesParams>;

interface AliasSummary {
  alias: string;
  indices: string[];
  index_count: number;
  has_filter: boolean;
  is_write_index?: boolean;
  routing?: string;
}

export const registerGetAliasesTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_get_aliases",
    "Get index aliases from Elasticsearch with pagination and filtering. Best for alias discovery, configuration review, index mapping analysis. Returns summarized or detailed alias information with configurable limits to handle large responses.",
    GetAliasesParams,
    async (params: GetAliasesParamsType): Promise<SearchResult> => {
      try {
        // Fetch aliases from Elasticsearch
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

        // Transform the response into a more manageable format
        const aliasMap = new Map<string, AliasSummary>();

        // Process all indices and their aliases
        for (const [indexName, indexData] of Object.entries(result)) {
          const aliases = indexData.aliases || {};

          for (const [aliasName, aliasConfig] of Object.entries(aliases)) {
            if (!aliasMap.has(aliasName)) {
              aliasMap.set(aliasName, {
                alias: aliasName,
                indices: [],
                index_count: 0,
                has_filter: false,
                is_write_index: false,
              });
            }

            const aliasSummary = aliasMap.get(aliasName)!;
            aliasSummary.indices.push(indexName);
            aliasSummary.index_count++;

            if (aliasConfig.filter) {
              aliasSummary.has_filter = true;
            }

            if (aliasConfig.is_write_index) {
              aliasSummary.is_write_index = true;
            }

            if (aliasConfig.routing) {
              aliasSummary.routing = aliasConfig.routing;
            }
          }
        }

        // Convert to array and sort
        const aliasArray = Array.from(aliasMap.values());

        // Sort aliases
        aliasArray.sort((a, b) => {
          switch (params.sortBy) {
            case "index_count":
              return b.index_count - a.index_count;
            case "alias_name":
              return a.alias.localeCompare(b.alias);
            default:
              return a.alias.localeCompare(b.alias);
          }
        });

        // Apply pagination
        const { results: paginatedAliases, metadata } = paginateResults(aliasArray, {
          limit: params.limit,
          defaultLimit: responsePresets.list.defaultLimit,
          maxLimit: responsePresets.list.maxLimit,
        });

        // Create response content
        const responseContent: string[] = [];

        // Add header with summary stats
        responseContent.push(createPaginationHeader(metadata, "Aliases"));

        if (paginatedAliases.length === 0) {
          responseContent.push("No aliases found matching the specified criteria.");
        } else if (params.summary) {
          // Summary mode - compact view
          responseContent.push("## Alias Summary\n");

          for (const alias of paginatedAliases) {
            responseContent.push(`### ${alias.alias}`);
            responseContent.push(`- **Indices**: ${alias.index_count}`);

            if (alias.index_count <= 5) {
              for (const idx of alias.indices) {
                responseContent.push(`  - ${idx}`);
              }
            } else {
              for (const idx of alias.indices.slice(0, 3)) {
                responseContent.push(`  - ${idx}`);
              }
              responseContent.push(`  - ... and ${alias.index_count - 3} more`);
            }

            if (alias.has_filter) {
              responseContent.push("- **Has Filter**: Yes");
            }

            if (alias.is_write_index) {
              responseContent.push("- **Write Index**: Yes");
            }

            if (alias.routing) {
              responseContent.push(`- **Routing**: ${alias.routing}`);
            }

            responseContent.push("");
          }

          // Add distribution summary if there are many aliases
          if (metadata.total > 10) {
            responseContent.push("\n## Statistics");
            const totalIndices = aliasArray.reduce((sum, alias) => sum + alias.index_count, 0);
            const avgIndicesPerAlias = (totalIndices / aliasArray.length).toFixed(1);

            responseContent.push(`- **Total Aliases**: ${metadata.total}`);
            responseContent.push(`- **Total Index Mappings**: ${totalIndices}`);
            responseContent.push(`- **Average Indices per Alias**: ${avgIndicesPerAlias}`);

            const writeAliases = aliasArray.filter((a) => a.is_write_index).length;
            if (writeAliases > 0) {
              responseContent.push(`- **Write Aliases**: ${writeAliases}`);
            }

            const filteredAliases = aliasArray.filter((a) => a.has_filter).length;
            if (filteredAliases > 0) {
              responseContent.push(`- **Filtered Aliases**: ${filteredAliases}`);
            }
          }
        } else {
          // Detailed mode - full alias information
          responseContent.push("## Alias Details\n");
          responseContent.push("```json");

          const detailedResults: any[] = [];

          for (const alias of paginatedAliases) {
            // Get the full alias configuration from the original result
            const aliasDetail: any = {
              name: alias.alias,
              indices: {},
            };

            for (const indexName of alias.indices) {
              if (result[indexName]?.aliases[alias.alias]) {
                aliasDetail.indices[indexName] = result[indexName].aliases[alias.alias];
              }
            }

            detailedResults.push(aliasDetail);
          }

          responseContent.push(JSON.stringify(detailedResults, null, 2));
          responseContent.push("```");
        }

        // Truncate response if needed
        const fullResponse = responseContent.join("\n");
        const { content: finalContent, truncated } = truncateResponse(fullResponse, {
          maxTokens: responsePresets.list.maxTokens,
        });

        if (truncated) {
          logger.warn("Alias response truncated due to size", {
            originalLength: fullResponse.length,
            truncatedLength: finalContent.length,
          });
        }

        return {
          content: [{ type: "text", text: finalContent } as TextContent],
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
            } as TextContent,
          ],
        };
      }
    },
  );
};
