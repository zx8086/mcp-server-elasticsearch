/* src/tools/core/get_mappings.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const GetMappingsParams = z.object({
  index: z
    .string()
    .trim()
    .min(1, "Index name is required")
    .describe("Name of the Elasticsearch index to get mappings for"),
});

type GetMappingsParamsType = z.infer<typeof GetMappingsParams>;

export const registerGetMappingsTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
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
    async (params: GetMappingsParamsType): Promise<SearchResult> => {
      const { index } = params;
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