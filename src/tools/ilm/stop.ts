/* src/tools/ilm/stop.ts */

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
const StopParams = z.object({
  masterTimeout: z.string().optional(),
  timeout: z.string().optional(),
});

type StopParamsType = z.infer<typeof StopParams>;

export const registerStopTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const stopImpl = async (
    params: StopParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.ilm.stop({
        master_timeout: params.masterTimeout,
        timeout: params.timeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to stop ILM:", {
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
    "elasticsearch_ilm_stop",
    "Stop the Index Lifecycle Management plugin in Elasticsearch. Best for maintenance operations, system control, preventing automated actions. Use when you need to halt all ILM operations during Elasticsearch cluster maintenance.",
    {
      masterTimeout: z.string().optional(),
      timeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "elasticsearch_ilm_stop",
      stopImpl,
      OperationType.WRITE,
    ),
  );
};
