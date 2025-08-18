/* src/tools/alias/delete_alias.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const DeleteAliasParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  name: z.string().min(1, "Alias name cannot be empty"),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
});

type DeleteAliasParamsType = z.infer<typeof DeleteAliasParams>;
export const registerDeleteAliasTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_delete_alias",
    "Delete an alias from an index in Elasticsearch. Best for alias cleanup, configuration management, removing unused references. Use when you need to remove named references to Elasticsearch indices during maintenance or restructuring.",
    {
      index: z.string().min(1, "Index cannot be empty"),
      name: z.string().min(1, "Alias name cannot be empty"),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params: DeleteAliasParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.deleteAlias({
          index: params.index,
          name: params.name,
          timeout: params.timeout,
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to delete alias:", {
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
