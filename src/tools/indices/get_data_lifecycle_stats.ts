/* src/tools/indices/get_data_lifecycle_stats.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// This tool has no parameters according to the API documentation
export const registerGetDataLifecycleStatsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_get_data_lifecycle_stats",
    "Get data stream lifecycle statistics from Elasticsearch. Best for data stream monitoring, lifecycle analysis, storage planning. Use when you need to track data stream lifecycle management and retention policies in Elasticsearch.",
    {},
    async (): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.getDataLifecycleStats(
          {},
          {
            opaqueId: "elasticsearch_get_data_lifecycle_stats",
          },
        );
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
