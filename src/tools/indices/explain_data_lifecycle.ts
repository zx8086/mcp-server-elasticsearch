/* src/tools/indices/explain_data_lifecycle.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema
const ExplainDataLifecycleParams = z.object({
  index: z.union([z.string(), z.array(z.string())]),
  include_defaults: z.boolean().optional(),
  master_timeout: z.string().optional(),
});

type ExplainDataLifecycleParamsType = z.infer<typeof ExplainDataLifecycleParams>;

export const registerExplainDataLifecycleTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "explain_data_lifecycle",
    "Get the status for a data stream lifecycle. Get information about an index or data stream's current data stream lifecycle status, such as time since index creation, time since rollover, the lifecycle configuration managing the index, or any errors encountered during lifecycle execution.",
    {
      index: z.union([z.string(), z.array(z.string())]),
      include_defaults: z.boolean().optional(),
      master_timeout: z.string().optional(),
    },
    async (params: ExplainDataLifecycleParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.indices.explainDataLifecycle({
          index: params.index,
          include_defaults: params.include_defaults,
          master_timeout: params.master_timeout,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to explain data lifecycle:", {
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
