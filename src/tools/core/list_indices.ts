/* src/tools/core/list_indices.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerListIndicesTool(server, esClient) {
  server.tool(
    "list_indices",
    "List all available Elasticsearch indices",
    {
      indexPattern: z
        .string()
        .trim()
        .min(1, "Index pattern is required")
        .describe("Index pattern of Elasticsearch indices to list"),
    },
    async ({ indexPattern }) => {
      logger.debug("Listing indices", { pattern: indexPattern });
      try {
        const response = await esClient.cat.indices({
          index: indexPattern,
          format: 'json',
          h: 'index,health,status,docs.count'
        });
        logger.debug("Found indices", { count: response.length });
        const indicesInfo = response.map((index) => ({
          index: index.index,
          health: index.health,
          status: index.status,
          docsCount: index["docs.count"],
        }));
        return {
          content: [
            { type: "text", text: `Found ${indicesInfo.length} indices` },
            { type: "text", text: JSON.stringify(indicesInfo, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("Failed to list indices:", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        return {
          content: [
            { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
        };
      }
    }
  );
} 