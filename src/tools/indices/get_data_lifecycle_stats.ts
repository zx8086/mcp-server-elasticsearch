/* src/tools/indices/get_data_lifecycle_stats.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// This tool has no parameters according to the API documentation
export const registerGetDataLifecycleStatsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "get_data_lifecycle_stats",
    "Get data stream lifecycle stats. Get statistics about the data streams that are managed by a data stream lifecycle.",
    {},
    async (): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.getDataLifecycleStats();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get data lifecycle stats:", {
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
