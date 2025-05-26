/* src/tools/ilm/start.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
} from "../types.js";

// Define the parameter schema
const StartParams = z.object({
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type StartParamsType = z.infer<typeof StartParams>;

export const registerStartTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const startImpl = async (
    params: StartParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.ilm.start({
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to start ILM:", {
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
  };

  server.tool(
    "ilm_start",
    "Start the ILM plugin. Start the index lifecycle management plugin if it is currently stopped. ILM is started automatically when the cluster is formed. Restarting ILM is necessary only when it has been stopped using the stop ILM API.",
    {
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "ilm_start",
      startImpl,
      OperationType.WRITE,
    ),
  );
};
