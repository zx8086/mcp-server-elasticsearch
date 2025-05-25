/* src/tools/analytics/get_multi_term_vectors.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const GetMultiTermVectorsParams = z.object({
  index: z.string().optional(),
  docs: z.array(z.record(z.any())).optional(),
  ids: z.array(z.string()).optional(),
  parameters: z.record(z.any()).optional(),
});

type GetMultiTermVectorsParamsType = z.infer<typeof GetMultiTermVectorsParams>;
export const registerGetMultiTermVectorsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "get_multi_term_vectors",
    "Get term vectors for multiple documents in Elasticsearch",
    {
      index: z.string().optional(),
      docs: z.array(z.record(z.any())).optional(),
      ids: z.array(z.string()).optional(),
      parameters: z.record(z.any()).optional(),
    },
    async (params: GetMultiTermVectorsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.mtermvectors(
          {
            index: params.index,
            docs: params.docs,
            ids: params.ids,
            parameters: params.parameters,
          },
          {
            opaqueId: "get_multi_term_vectors",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get multi term vectors:", {
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
