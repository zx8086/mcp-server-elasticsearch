/* src/tools/enrich/stats.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const StatsParams = z.object({
  masterTimeout: z.string().optional(),
});

type StatsParamsType = z.infer<typeof StatsParams>;

export const registerEnrichStatsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_enrich_stats",
    "Get Elasticsearch enrich coordinator statistics and execution status. Best for performance monitoring, policy tracking, enrichment analysis. Use when you need to monitor enrich policy execution and coordinator performance in Elasticsearch.",
    {
      masterTimeout: z.string().optional(),
    },
    async (params: StatsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.enrich.stats({
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get enrich stats:", {
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
