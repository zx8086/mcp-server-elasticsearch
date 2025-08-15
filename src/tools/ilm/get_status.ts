/* src/tools/ilm/get_status.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

export const registerGetStatusTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_ilm_get_status",
    "Get Index Lifecycle Management status in Elasticsearch. Best for service monitoring, system status checks, troubleshooting. Use when you need to check if ILM is running and operational in Elasticsearch.",
    {},
    async (): Promise<SearchResult> => {
      try {
        const result = await esClient.ilm.getStatus(
          {},
          {
            opaqueId: "elasticsearch_ilm_get_status",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get ILM status:", {
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
