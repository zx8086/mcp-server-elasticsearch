/* src/tools/indices/exists_alias.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const ExistsAliasParams = z.object({
  name: z.union([z.string(), z.array(z.string())]),
  index: z.union([z.string(), z.array(z.string())]).optional(),
  allow_no_indices: booleanField().optional(),
  expand_wildcards: z
    .enum(["all", "open", "closed", "hidden", "none"])
    .or(z.array(z.enum(["all", "open", "closed", "hidden", "none"])))
    .optional(),
  ignore_unavailable: booleanField().optional(),
  master_timeout: z.string().optional(),
});

type ExistsAliasParamsType = z.infer<typeof ExistsAliasParams>;

export const registerExistsAliasTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_exists_alias",
    "Check if index or data stream aliases exist in Elasticsearch. Best for alias validation, deployment verification, configuration checks. Use when you need to verify alias presence before operations in Elasticsearch.",
    {
      name: z.union([z.string(), z.array(z.string())]),
      index: z.union([z.string(), z.array(z.string())]).optional(),
      allow_no_indices: booleanField().optional(),
      expand_wildcards: z
        .enum(["all", "open", "closed", "hidden", "none"])
        .or(z.array(z.enum(["all", "open", "closed", "hidden", "none"])))
        .optional(),
      ignore_unavailable: booleanField().optional(),
      master_timeout: z.string().optional(),
    },
    async (params: ExistsAliasParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.existsAlias({
          name: params.name,
          index: params.index,
          allow_no_indices: params.allow_no_indices,
          expand_wildcards: params.expand_wildcards,
          ignore_unavailable: params.ignore_unavailable,
          master_timeout: params.master_timeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ exists: result }, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to check if alias exists:", {
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
