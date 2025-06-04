/* src/tools/analytics/get_multi_term_vectors.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const GetMultiTermVectorsParams = z.object({
  index: z.string().optional(),
  docs: z.array(
    z.object({
      _id: z.string(),
      _index: z.string().optional(),
      _source: z.boolean().optional(),
      fields: z.array(z.string()).optional(),
      field_statistics: z.boolean().optional(),
      offsets: z.boolean().optional(),
      payloads: z.boolean().optional(),
      positions: z.boolean().optional(),
      term_statistics: z.boolean().optional(),
      routing: z.string().optional(),
      version: z.number().optional(),
      version_type: z.enum(['internal', 'external', 'external_gte', 'force']).optional(),
    })
  ).optional(),
  ids: z.array(z.string()).optional(),
});

type GetMultiTermVectorsParamsType = z.infer<typeof GetMultiTermVectorsParams>;
export const registerGetMultiTermVectorsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_get_multi_term_vectors",
    "Get term vectors for multiple documents in Elasticsearch. Best for: text analysis, similarity calculations, relevance tuning. Use when you need to analyze term frequency and position data for multiple documents in Elasticsearch indices.",
    GetMultiTermVectorsParams.shape,
    async (params: GetMultiTermVectorsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.mtermvectors(
          {
            index: params.index,
            docs: params.docs?.map(doc => ({
              _id: doc._id,
              _index: doc._index,
              _source: doc._source,
              fields: doc.fields,
              field_statistics: doc.field_statistics,
              offsets: doc.offsets,
              payloads: doc.payloads,
              positions: doc.positions,
              term_statistics: doc.term_statistics,
              routing: doc.routing,
              version: doc.version,
              version_type: doc.version_type,
            })),
            ids: params.ids,
          },
          {
            opaqueId: "elasticsearch_get_multi_term_vectors",
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
