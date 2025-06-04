/* src/tools/ilm/get_lifecycle.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema
const GetLifecycleParams = z.object({
  policy: z.string().optional(),
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type GetLifecycleParamsType = z.infer<typeof GetLifecycleParams>;

export const registerGetLifecycleTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_ilm_get_lifecycle",
    "Get Index Lifecycle Management (ILM) policies from Elasticsearch. Best for: data lifecycle management, policy inspection, compliance monitoring. Use when you need to retrieve ILM policies that automate index transitions through hot, warm, cold, and delete phases.",
    {
      policy: z.string().optional(),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    async (params: GetLifecycleParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.ilm.getLifecycle({
          name: params.policy,
          master_timeout: params.masterTimeout,
          timeout: params.timeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to get lifecycle policies:", {
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
