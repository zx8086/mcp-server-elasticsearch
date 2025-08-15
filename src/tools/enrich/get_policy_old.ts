/* src/tools/enrich/get_policy.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema
const GetPolicyParams = z.object({
  name: z.union([z.string(), z.array(z.string())]).optional(),
  masterTimeout: z.string().optional(),
});

type GetPolicyParamsType = z.infer<typeof GetPolicyParams>;

export const registerEnrichGetPolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.tool(
    "elasticsearch_enrich_get_policy",
    "Get an enrich policy from Elasticsearch. Best for data enrichment configuration, policy inspection, document enhancement workflows. Use when you need to retrieve enrich policies that add reference data to documents during ingestion.",
    {
      name: z.union([z.string(), z.array(z.string())]).optional(),
      masterTimeout: z.string().optional(),
    },
    async (params: GetPolicyParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.enrich.getPolicy({
          name: params.name,
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get enrich policy:", {
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
