import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetMappingsTool(server, esClient) {
  server.tool(
    "get_mappings",
    "Get field mappings for a specific Elasticsearch index",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to get mappings for"),
    },
    async ({ index }) => {
      try {
        logger.debug("Getting mappings", { index });
        const response = await esClient.indices.getMapping({ index });
        logger.debug("Retrieved mappings", { index });
        return {
          content: [
            { type: "text", text: `Mappings for index: ${index}` },
            { type: "text", text: JSON.stringify(response[index]?.mappings || {}, null, 2) },
          ],
        };
      } catch (error) {
        logger.error("Failed to get mappings:", {
          error: error instanceof Error ? error.message : String(error)
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