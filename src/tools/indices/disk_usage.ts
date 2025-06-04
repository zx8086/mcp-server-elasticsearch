/* src/tools/indices/disk_usage.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const DiskUsageParams = z.object({
  index: z.union([z.string(), z.array(z.string())]),
  allowNoIndices: z.boolean().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).or(z.array(z.enum(["all", "open", "closed", "hidden", "none"]))).optional(),
  flush: z.boolean().optional(),
  ignoreUnavailable: z.boolean().optional(),
  runExpensiveTasks: z.boolean().optional(),
});

type DiskUsageParamsType = z.infer<typeof DiskUsageParams>;

export const registerDiskUsageTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_disk_usage",
    "Analyze index disk usage per field in Elasticsearch. Best for: storage optimization, field analysis, capacity planning. Use when you need to understand disk consumption patterns and optimize storage usage for Elasticsearch indices and data streams.",
    {
      index: z.union([z.string(), z.array(z.string())]),
      allowNoIndices: z.boolean().optional(),
      expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).or(z.array(z.enum(["all", "open", "closed", "hidden", "none"]))).optional(),
      flush: z.boolean().optional(),
      ignoreUnavailable: z.boolean().optional(),
      runExpensiveTasks: z.boolean().optional(),
    },
    async (params: DiskUsageParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.diskUsage({
          index: params.index,
          allow_no_indices: params.allowNoIndices,
          expand_wildcards: params.expandWildcards,
          flush: params.flush,
          ignore_unavailable: params.ignoreUnavailable,
          run_expensive_tasks: params.runExpensiveTasks,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to analyze disk usage:", {
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
