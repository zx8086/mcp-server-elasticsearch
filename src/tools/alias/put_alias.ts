/* src/tools/alias/put_alias.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const PutAliasParams = z.object({
  index: z.string().min(1, "Index is required"),
  name: z.string().min(1, "Alias name is required"),
  filter: z.record(z.any()).optional(),
  routing: z.string().optional(),
  isWriteIndex: z.boolean().optional(),
});

type PutAliasParamsType = z.infer<typeof PutAliasParams>;
export const registerPutAliasTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "put_alias",
    "Add an alias to an index in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      name: z.string().min(1, "Alias name is required"),
      filter: z.record(z.any()).optional(),
      routing: z.string().optional(),
      isWriteIndex: z.boolean().optional(),
    },
    async (params: PutAliasParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.putAlias(
          {
            index: params.index,
            name: params.name,
            filter: params.filter,
            routing: params.routing,
            is_write_index: params.isWriteIndex,
          },
          {
            opaqueId: "elasticsearch_put_alias",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to put alias:", {
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
