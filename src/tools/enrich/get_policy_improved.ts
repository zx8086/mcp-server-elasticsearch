/* src/tools/enrich/get_policy_improved.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import {
  createPaginationHeader,
  paginateResults,
  responsePresets,
  truncateResponse,
} from "../../utils/responseHandling.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema with pagination support
const GetPolicyParams = z.object({
  name: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("Policy name(s) to retrieve"),
  masterTimeout: z.string().optional(),
  // New pagination and response control parameters
  limit: z.number().min(1).max(50).default(20).describe("Maximum number of policies to return (default: 20, max: 50)"),
  summary: z.boolean().default(true).describe("Return summarized policy information instead of full details"),
  sortBy: z.enum(["name", "type", "indices_count"]).default("name").describe("Sort policies by specified field"),
});

type GetPolicyParamsType = z.infer<typeof GetPolicyParams>;

interface PolicySummary {
  name: string;
  type: string;
  source_indices: string[];
  match_field: string;
  enrich_fields: string[];
  query?: boolean;
  created?: string;
}

export const registerEnrichGetPolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_enrich_get_policy",
    "Get enrich policies from Elasticsearch with pagination and filtering. Best for data enrichment configuration, policy inspection, document enhancement workflows. Returns summarized or detailed policy information with configurable limits.",
    GetPolicyParams,
    async (params: GetPolicyParamsType): Promise<SearchResult> => {
      try {
        // Fetch policies from Elasticsearch
        const result = await esClient.enrich.getPolicy({
          name: params.name,
          master_timeout: params.masterTimeout,
        });

        // Extract policies array
        const policies: any[] = result.policies || [];

        // Transform policies into summary format
        const policySummaries: PolicySummary[] = policies.map((policy: any) => {
          const config = policy.config;

          // Determine policy type and extract config
          let type = "unknown";
          let policyConfig: any = {};

          if (config.match) {
            type = "match";
            policyConfig = config.match;
          } else if (config.geo_match) {
            type = "geo_match";
            policyConfig = config.geo_match;
          } else if (config.range) {
            type = "range";
            policyConfig = config.range;
          }

          return {
            name: policyConfig.name || "unnamed",
            type: type,
            source_indices: Array.isArray(policyConfig.indices)
              ? policyConfig.indices
              : [policyConfig.indices].filter(Boolean),
            match_field: policyConfig.match_field || "",
            enrich_fields: policyConfig.enrich_fields || [],
            query: !!policyConfig.query,
            created: policy.created || undefined,
          };
        });

        // If a specific policy was requested, filter results
        if (params.name && !Array.isArray(params.name)) {
          const filtered = policySummaries.filter((p) => p.name === params.name);
          if (filtered.length === 1) {
            // Return just the specific policy requested
            const policy = policies.find((p: any) => {
              const cfg = p.config.match || p.config.geo_match || p.config.range;
              return cfg?.name === params.name;
            });
            return {
              content: [
                {
                  type: "text",
                  text: `## Enrich Policy: ${params.name}\n\n\`\`\`json\n${JSON.stringify(policy, null, 2)}\n\`\`\``,
                } as TextContent,
              ],
            };
          }
        }

        // Sort policies
        policySummaries.sort((a, b) => {
          switch (params.sortBy) {
            case "type":
              return a.type.localeCompare(b.type);
            case "indices_count":
              return b.source_indices.length - a.source_indices.length;
            default:
              return a.name.localeCompare(b.name);
          }
        });

        // Apply pagination
        const { results: paginatedPolicies, metadata } = paginateResults(policySummaries, {
          limit: params.limit,
          defaultLimit: responsePresets.list.defaultLimit,
          maxLimit: responsePresets.list.maxLimit,
        });

        // Create response content
        const responseContent: string[] = [];

        // Add header with summary stats
        responseContent.push(createPaginationHeader(metadata, "Enrich Policies"));

        if (paginatedPolicies.length === 0) {
          responseContent.push("No enrich policies found.");
        } else if (params.summary) {
          // Summary mode - compact view
          for (const policy of paginatedPolicies) {
            responseContent.push(`### ${policy.name}`);
            responseContent.push(`- **Type**: ${policy.type}`);
            responseContent.push(`- **Match Field**: ${policy.match_field}`);

            responseContent.push(`- **Source Indices**: ${policy.source_indices.length}`);
            if (policy.source_indices.length <= 3) {
              for (const idx of policy.source_indices) {
                responseContent.push(`  - ${idx}`);
              }
            } else {
              for (const idx of policy.source_indices.slice(0, 2)) {
                responseContent.push(`  - ${idx}`);
              }
              responseContent.push(`  - ... and ${policy.source_indices.length - 2} more`);
            }

            responseContent.push(`- **Enrich Fields**: ${policy.enrich_fields.length}`);
            if (policy.enrich_fields.length <= 5) {
              for (const field of policy.enrich_fields) {
                responseContent.push(`  - ${field}`);
              }
            } else {
              for (const field of policy.enrich_fields.slice(0, 3)) {
                responseContent.push(`  - ${field}`);
              }
              responseContent.push(`  - ... and ${policy.enrich_fields.length - 3} more`);
            }

            if (policy.query) {
              responseContent.push("- **Has Query Filter**: Yes");
            }

            if (policy.created) {
              responseContent.push(`- **Created**: ${new Date(policy.created).toISOString().split("T")[0]}`);
            }

            responseContent.push("");
          }

          // Add type distribution if there are multiple policies
          if (metadata.total > 5) {
            responseContent.push("\n## Policy Statistics");

            const typeCount = policySummaries.reduce(
              (acc, p) => {
                acc[p.type] = (acc[p.type] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            );

            responseContent.push(`- **Total Policies**: ${metadata.total}`);
            responseContent.push("- **Policy Types**:");
            for (const [type, count] of Object.entries(typeCount).sort(([, a], [, b]) => b - a)) {
              responseContent.push(`  - ${type}: ${count}`);
            }

            const avgFields = (
              policySummaries.reduce((sum, p) => sum + p.enrich_fields.length, 0) / policySummaries.length
            ).toFixed(1);
            responseContent.push(`- **Average Enrich Fields**: ${avgFields}`);

            const withQuery = policySummaries.filter((p) => p.query).length;
            if (withQuery > 0) {
              responseContent.push(`- **Policies with Query Filter**: ${withQuery}`);
            }
          }
        } else {
          // Detailed mode - full policy information
          responseContent.push("## Policy Details\n");
          responseContent.push("```json");

          const detailedResults = paginatedPolicies.map((policySummary) => {
            return policies.find((p: any) => {
              const cfg = p.config.match || p.config.geo_match || p.config.range;
              return cfg?.name === policySummary.name;
            });
          });

          responseContent.push(JSON.stringify(detailedResults, null, 2));
          responseContent.push("```");
        }

        // Truncate response if needed
        const fullResponse = responseContent.join("\n");
        const { content: finalContent, truncated } = truncateResponse(fullResponse, {
          maxTokens: responsePresets.list.maxTokens,
        });

        if (truncated) {
          logger.warn("Enrich policy response truncated due to size", {
            originalLength: fullResponse.length,
            truncatedLength: finalContent.length,
          });
        }

        return {
          content: [{ type: "text", text: finalContent } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to get enrich policy:", {
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
