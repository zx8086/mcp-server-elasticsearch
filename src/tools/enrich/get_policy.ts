/* src/tools/enrich/get_policy.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const GetPolicyParams = z.object({
  name: z.union([z.string(), z.array(z.string())]).optional(),
  masterTimeout: z.string().optional(),
});

type GetPolicyParamsType = z.infer<typeof GetPolicyParams>;

export const registerEnrichGetPolicyTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "enrich_get_policy",
    "Get an enrich policy. Returns information about an enrich policy.",
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