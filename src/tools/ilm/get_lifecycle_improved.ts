/* src/tools/ilm/get_lifecycle_improved.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema with new options
const GetLifecycleParams = z.object({
  policy: z.string().optional().describe("Specific policy name to retrieve"),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
  // New parameters for handling large responses
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of policies to return (default: 20, max: 100)"),
  summary: z
    .boolean()
    .default(true)
    .describe("Return summarized policy information instead of full details"),
  includeIndices: z
    .boolean()
    .default(false)
    .describe("Include list of indices using each policy"),
  sortBy: z
    .enum(["name", "modified_date", "version", "indices_count"])
    .default("name")
    .describe("Sort policies by specified field"),
});

type GetLifecycleParamsType = z.infer<typeof GetLifecycleParams>;

interface PolicySummary {
  name: string;
  version: number;
  modified_date: string;
  phases: string[];
  retention_days?: number;
  indices_count?: number;
  data_streams_count?: number;
  description?: string;
}

interface PolicyDetail {
  summary: PolicySummary;
  phases?: Record<string, any>;
  in_use_by?: {
    indices?: string[];
    data_streams?: string[];
    composable_templates?: string[];
  };
}

export const registerGetLifecycleImprovedTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_ilm_get_lifecycle",
    "Get Index Lifecycle Management (ILM) policies from Elasticsearch with smart response handling. Supports server-side field filtering via filter_path to prevent large responses. Returns summarized or detailed policy information with configurable limits. Best for data lifecycle management, policy inspection, compliance monitoring.",
    GetLifecycleParams,
    async (params: GetLifecycleParamsType): Promise<SearchResult> => {
      try {
        // Fetch policies from Elasticsearch
        const result = await esClient.ilm.getLifecycle({
          name: params.policy,
          master_timeout: params.masterTimeout,
          timeout: params.timeout,
        });

        // Convert response to array of policies
        let policies = Object.entries(result).map(([name, policy]) => ({
          name,
          ...policy,
        }));

        // If a specific policy was requested, filter results
        if (params.policy) {
          policies = policies.filter(policy => policy.name === params.policy);
        }

        // Calculate retention days for each policy (if delete phase exists)
        const policiesWithRetention = policies.map(policy => {
          const deletePhase = policy.policy?.phases?.delete;
          let retentionDays: number | undefined;
          
          if (deletePhase?.min_age) {
            const minAge = deletePhase.min_age;
            const match = minAge.match(/(\d+)d/);
            if (match) {
              retentionDays = parseInt(match[1]);
            }
          }

          return {
            ...policy,
            retention_days: retentionDays,
            indices_count: policy.in_use_by?.indices?.length || 0,
            data_streams_count: policy.in_use_by?.data_streams?.length || 0,
          };
        });

        // Sort policies
        const sortedPolicies = policiesWithRetention.sort((a, b) => {
          switch (params.sortBy) {
            case "modified_date":
              return new Date(b.modified_date || 0).getTime() - new Date(a.modified_date || 0).getTime();
            case "version":
              return (b.version || 0) - (a.version || 0);
            case "indices_count":
              return b.indices_count - a.indices_count;
            case "name":
            default:
              return a.name.localeCompare(b.name);
          }
        });

        // Apply limit
        const totalPolicies = sortedPolicies.length;
        const limitedPolicies = sortedPolicies.slice(0, params.limit);
        const isLimited = totalPolicies > params.limit;

        // Create response content
        const responseContent: string[] = [];

        // Add header with summary stats
        responseContent.push(`## ILM Policies (${limitedPolicies.length}${isLimited ? ` of ${totalPolicies}` : ''})\n`);

        if (isLimited) {
          responseContent.push(`⚠️ Showing first ${params.limit} policies. Use 'limit' parameter to see more.\n`);
        }

        // Process each policy
        for (const policy of limitedPolicies) {
          if (params.summary) {
            // Summary mode - just key information
            const summary: PolicySummary = {
              name: policy.name,
              version: policy.version || 0,
              modified_date: policy.modified_date || "unknown",
              phases: Object.keys(policy.policy?.phases || {}),
              retention_days: policy.retention_days,
              indices_count: policy.indices_count,
              data_streams_count: policy.data_streams_count,
              description: policy.policy?._meta?.description,
            };

            responseContent.push(`### ${summary.name}`);
            responseContent.push(`- **Version**: ${summary.version}`);
            responseContent.push(`- **Modified**: ${new Date(summary.modified_date).toISOString().split('T')[0]}`);
            responseContent.push(`- **Phases**: ${summary.phases.join(" → ")}`);
            if (summary.retention_days) {
              responseContent.push(`- **Retention**: ${summary.retention_days} days`);
            }
            if (summary.indices_count > 0) {
              responseContent.push(`- **Indices**: ${summary.indices_count}`);
            }
            if (summary.data_streams_count > 0) {
              responseContent.push(`- **Data Streams**: ${summary.data_streams_count}`);
            }
            if (summary.description) {
              responseContent.push(`- **Description**: ${summary.description}`);
            }
            responseContent.push("");
          } else {
            // Detailed mode - full policy details
            const detail: PolicyDetail = {
              summary: {
                name: policy.name,
                version: policy.version || 0,
                modified_date: policy.modified_date || "unknown",
                phases: Object.keys(policy.policy?.phases || {}),
                retention_days: policy.retention_days,
              },
              phases: policy.policy?.phases,
            };

            if (params.includeIndices && policy.in_use_by) {
              detail.in_use_by = {
                indices: policy.in_use_by.indices?.slice(0, 10), // Limit indices list
                data_streams: policy.in_use_by.data_streams?.slice(0, 10),
                composable_templates: policy.in_use_by.composable_templates,
              };
            }

            responseContent.push(`### ${detail.summary.name}\n`);
            responseContent.push("```json");
            responseContent.push(JSON.stringify(detail, null, 2));
            responseContent.push("```\n");
          }
        }

        // Add phase distribution summary at the end
        if (params.summary && limitedPolicies.length > 5) {
          responseContent.push("\n## Phase Distribution");
          const phaseCount: Record<string, number> = {};
          limitedPolicies.forEach(policy => {
            Object.keys(policy.policy?.phases || {}).forEach(phase => {
              phaseCount[phase] = (phaseCount[phase] || 0) + 1;
            });
          });
          
          Object.entries(phaseCount)
            .sort(([, a], [, b]) => b - a)
            .forEach(([phase, count]) => {
              responseContent.push(`- **${phase}**: ${count} policies`);
            });
        }

        return {
          content: [{ type: "text", text: responseContent.join("\n") } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to get lifecycle policies:", {
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