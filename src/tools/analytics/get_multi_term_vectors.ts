/* src/tools/analytics/get_multi_term_vectors.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerGetMultiTermVectorsTool(server, esClient) {
  server.tool(
    "get_multi_term_vectors",
    "Get term vectors for multiple documents in Elasticsearch",
    {
      index: z.string().optional(),
      docs: z.array(z.record(z.any())).optional(),
      ids: z.array(z.string()).optional(),
      parameters: z.record(z.any()).optional(),
    },
    async (params) => {
      try {
        const result = await esClient.mtermvectors({
          index: params.index,
          docs: params.docs,
          ids: params.ids,
          parameters: params.parameters,
        }, {
          opaqueId: 'get_multi_term_vectors'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to get multi term vectors:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 