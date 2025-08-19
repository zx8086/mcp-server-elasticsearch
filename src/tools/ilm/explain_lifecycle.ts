/* src/tools/ilm/explain_lifecycle.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const ExplainLifecycleParams = z.object({
  index: z.string().optional().describe("Index pattern. Use '*' for all"),
  onlyErrors: z.boolean().optional().describe("Only show errors"),
  onlyManaged: z.boolean().optional().describe("Only show ILM-managed indices. Highly recommended for large clusters"),
  masterTimeout: z.string().optional().describe("Master node timeout"),
  limit: z
    .union([
      z.number(),
      z
        .string()
        .regex(/^\d+$/)
        .transform((val) => parseInt(val, 10)),
    ])
    .pipe(z.number().min(1).max(500))
    .optional()
    .describe("Maximum number of indices to return. Without this, returns ALL matching indices"),
  includeDetails: z.boolean().optional().describe("Include full lifecycle details (false for compact output)"),
});

type ExplainLifecycleParamsType = z.infer<typeof ExplainLifecycleParams>;

export const registerExplainLifecycleTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_ilm_explain_lifecycle",
    "Explain ILM status for indices. WARNING: Large clusters have 1000+ indices! ALWAYS specify filters to avoid truncation. Examples: {onlyManaged: true, limit: 50} for managed indices only, {index: 'logs-*', limit: 100} for specific pattern, {onlyErrors: true} for errors only. Response auto-limits to 50 indices if >100 found without explicit limit.",
    ExplainLifecycleParams,
    async (params: ExplainLifecycleParamsType): Promise<SearchResult> => {
      try {
        // Use parameters as provided by LLM
        const index = params.index || "*";
        const { limit, includeDetails, onlyManaged, onlyErrors, masterTimeout } = params;

        logger.debug("Explaining ILM lifecycle", { index, limit, onlyManaged, includeDetails });

        const result = await esClient.ilm.explainLifecycle(
          {
            index: index,
            only_errors: onlyErrors,
            only_managed: onlyManaged,
            master_timeout: masterTimeout,
          },
          {
            opaqueId: "elasticsearch_ilm_explain_lifecycle",
          },
        );

        // Process and limit results
        if (result.indices) {
          const allIndices = Object.entries(result.indices);
          const totalCount = allIndices.length;

          // Apply limit if specified, otherwise use a safe default for large responses
          const effectiveLimit = limit || (totalCount > 100 ? 50 : totalCount);

          if (totalCount > effectiveLimit) {
            // Sort by importance: errors first, then by phase
            const sortedIndices = allIndices.sort(([, a], [, b]) => {
              // Prioritize indices with errors
              const aHasError = (a as any).failed_step || (a as any).step_info?.type === "error";
              const bHasError = (b as any).failed_step || (b as any).step_info?.type === "error";
              if (aHasError && !bHasError) return -1;
              if (!aHasError && bHasError) return 1;

              // Then sort by phase priority
              const phaseOrder: Record<string, number> = {
                hot: 0,
                warm: 1,
                cold: 2,
                frozen: 3,
                delete: 4,
              };
              const aPhase = (a as any).phase || "unknown";
              const bPhase = (b as any).phase || "unknown";
              return (phaseOrder[aPhase] ?? 5) - (phaseOrder[bPhase] ?? 5);
            });

            // Apply limit
            const limitedIndices = sortedIndices.slice(0, effectiveLimit);

            // Create compact or detailed output
            const processedIndices: Record<string, any> = {};
            for (const [indexName, indexData] of limitedIndices) {
              if (includeDetails) {
                processedIndices[indexName] = indexData;
              } else {
                // Compact format - only essential info
                const data = indexData as any;
                processedIndices[indexName] = {
                  managed: data.managed,
                  policy: data.policy,
                  phase: data.phase,
                  age: data.age,
                  ...(data.failed_step && { failed_step: data.failed_step }),
                  ...(data.step_info?.type === "error" && { error: data.step_info.reason }),
                };
              }
            }

            // Count statistics
            const errorCount = allIndices.filter(([, data]) => {
              const d = data as any;
              return d.failed_step || d.step_info?.type === "error";
            }).length;

            const phaseStats: Record<string, number> = {};
            for (const [, data] of allIndices) {
              const phase = (data as any).phase || "unknown";
              phaseStats[phase] = (phaseStats[phase] || 0) + 1;
            }

            return {
              content: [
                {
                  type: "text",
                  text: `⚠️ Showing ${effectiveLimit} of ${totalCount} indices (errors shown first)\n📊 Statistics: ${errorCount} errors, Phases: ${JSON.stringify(phaseStats)}\n💡 Use 'limit' parameter to see more indices`,
                },
                {
                  type: "text",
                  text: JSON.stringify({ indices: processedIndices }, null, 2),
                },
              ],
            };
          } else {
            // Process all indices without limiting
            const processedIndices: Record<string, any> = {};
            for (const [indexName, indexData] of allIndices) {
              if (!includeDetails) {
                const data = indexData as any;
                processedIndices[indexName] = {
                  managed: data.managed,
                  policy: data.policy,
                  phase: data.phase,
                  age: data.age,
                  ...(data.failed_step && { failed_step: data.failed_step }),
                  ...(data.step_info?.type === "error" && { error: data.step_info.reason }),
                };
              } else {
                processedIndices[indexName] = indexData;
              }
            }

            return {
              content: [
                {
                  type: "text",
                  text: `Found ${totalCount} indices${onlyManaged ? " (managed only)" : ""}`,
                },
                {
                  type: "text",
                  text: JSON.stringify({ indices: processedIndices }, null, 2),
                },
              ],
            };
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to explain lifecycle:", {
          error: error instanceof Error ? error.message : String(error),
        });

        // Check if it's a response size error
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isResponseTooLarge =
          errorMessage.includes("exceeds maximum") ||
          errorMessage.includes("too large") ||
          errorMessage.includes("1048576");

        if (isResponseTooLarge) {
          return {
            content: [
              {
                type: "text",
                text:
                  `❌ Response too large! Your cluster has too many indices to return without filters.\n\n` +
                  `✅ Solution: Use one of these approaches:\n` +
                  `1. {onlyManaged: true, limit: 50} - Show only ILM-managed indices\n` +
                  `2. {index: "logs-*", limit: 100} - Filter by specific pattern\n` +
                  `3. {onlyErrors: true, limit: 50} - Show only indices with errors\n\n` +
                  `Original error: ${errorMessage}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );
};
