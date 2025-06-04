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
    "elasticsearch_explain_data_lifecycle",
    "Get data stream lifecycle status and execution details in Elasticsearch. Best for lifecycle monitoring, troubleshooting, policy analysis. Use when you need to understand data stream lifecycle execution status and configuration in Elasticsearch.",
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
