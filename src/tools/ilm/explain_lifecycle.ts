/* src/tools/ilm/explain_lifecycle.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const ExplainLifecycleParams = z.object({
  index: z.string().min(1, "Index is required"),
  onlyErrors: z.boolean().optional(),
  onlyManaged: z.boolean().optional(),
  masterTimeout: z.string().optional(),
});

type ExplainLifecycleParamsType = z.infer<typeof ExplainLifecycleParams>;

export const registerExplainLifecycleTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "ilm_explain_lifecycle",
    "Explain the lifecycle state. Get the current lifecycle status for one or more indices. For data streams, the API retrieves the current lifecycle status for the stream's backing indices.",
    {
      index: z.string().min(1, "Index is required"),
      onlyErrors: z.boolean().optional(),
      onlyManaged: z.boolean().optional(),
      masterTimeout: z.string().optional(),
    },
    async (params: ExplainLifecycleParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.ilm.explainLifecycle({
          index: params.index,
          only_errors: params.onlyErrors,
          only_managed: params.onlyManaged,
          master_timeout: params.masterTimeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to explain lifecycle:", {
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
