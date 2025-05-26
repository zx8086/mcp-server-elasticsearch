/* src/tools/ilm/get_lifecycle.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

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
    "ilm_get_lifecycle",
    "Get lifecycle policies",
    {
      policy: z.string().optional(),
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    async (params: GetLifecycleParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.ilm.getLifecycle({
          policy: params.policy,
          master_timeout: params.masterTimeout,
          timeout: params.timeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
            },
          ],
        };
      }
    },
  );
};
