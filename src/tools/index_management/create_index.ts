/* src/tools/index_management/create_index.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const CreateIndexParams = z.object({
  index: z.string().min(1, "Index is required"),
  aliases: z.record(z.any()).optional(),
  mappings: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional(),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
});

type CreateIndexParamsType = z.infer<typeof CreateIndexParams>;
export const registerCreateIndexTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "create_index",
    "Create an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      aliases: z.record(z.any()).optional(),
      mappings: z.record(z.any()).optional(),
      settings: z.record(z.any()).optional(),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
      waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
    },
    async (params: CreateIndexParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.create(
          {
            index: params.index,
            aliases: params.aliases,
            mappings: params.mappings,
            settings: params.settings,
            timeout: params.timeout,
            master_timeout: params.masterTimeout,
            wait_for_active_shards: params.waitForActiveShards,
          },
          {
            opaqueId: "elasticsearch_create_index",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to create index:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            } as TextContent,
          ],
        };
      }
    },
  );
};
