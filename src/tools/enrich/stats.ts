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
    "enrich_stats",
    "Get enrich stats. Returns enrich coordinator statistics and information about enrich policies that are currently executing.",
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