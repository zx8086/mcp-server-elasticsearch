/* src/tools/alias/update_aliases.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const UpdateAliasesParams = z.object({
  actions: z.array(z.record(z.any())),
  timeout: z.string().optional(),
  masterTimeout: z.string().optional(),
});

type UpdateAliasesParamsType = z.infer<typeof UpdateAliasesParams>;
export const registerUpdateAliasesTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "update_aliases",
    "Update aliases in Elasticsearch using the aliases API",
    {
      actions: z.array(z.record(z.any())),
      timeout: z.string().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params: UpdateAliasesParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.updateAliases(
          {
            actions: params.actions,
            timeout: params.timeout,
            master_timeout: params.masterTimeout,
          },
          {
            opaqueId: "elasticsearch_update_aliases",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to update aliases:", {
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
