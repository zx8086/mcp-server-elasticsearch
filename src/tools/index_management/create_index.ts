/* src/tools/index_management/create_index.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const CreateIndexParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  aliases: z.object({}).passthrough().optional(),
  mappings: z.object({}).passthrough().optional(),
  settings: z.object({}).passthrough().optional(),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
});

type CreateIndexParamsType = z.infer<typeof CreateIndexParams>;
export const registerCreateIndexTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_create_index",
    "Create an index in Elasticsearch with custom settings and mappings. Best for index initialization, schema definition, data structure setup. Use when you need to create new Elasticsearch indices with specific configurations for document storage.",
    {
      index: z.string().min(1, "Index cannot be empty"),
      aliases: z.object({}).passthrough().optional(),
      mappings: z.object({}).passthrough().optional(),
      settings: z.object({}).passthrough().optional(),
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
