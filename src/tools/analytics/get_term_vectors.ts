/* src/tools/analytics/get_term_vectors.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const GetTermVectorsParams = z.object({
  index: z.string().min(1, "Index is required"),
  id: z.string().optional(),
  doc: z.record(z.unknown()).optional(),
  fields: z.array(z.string()).optional(),
  field_statistics: z.boolean().optional(),
  offsets: z.boolean().optional(),
  payloads: z.boolean().optional(),
  positions: z.boolean().optional(),
  term_statistics: z.boolean().optional(),
  routing: z.string().optional(),
  version: z.number().optional(),
  version_type: z.enum(['internal', 'external', 'external_gte', 'force']).optional(),
  filter: z.record(z.unknown()).optional(),
  per_field_analyzer: z.record(z.string()).optional(),
  preference: z.string().optional(),
  realtime: z.boolean().optional(),
});

type GetTermVectorsParamsType = z.infer<typeof GetTermVectorsParams>;
export const registerGetTermVectorsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "elasticsearch_get_term_vectors",
    "Get term vectors for a document in Elasticsearch. Best for text analysis, relevance tuning, similarity calculations. Use when you need to analyze term frequency, positions, and offsets for document text analysis in Elasticsearch.",
    GetTermVectorsParams.shape,
    async (params: GetTermVectorsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.termvectors(
          {
            index: params.index,
            id: params.id,
            doc: params.doc,
            fields: params.fields,
            field_statistics: params.field_statistics,
            offsets: params.offsets,
            payloads: params.payloads,
            positions: params.positions,
            term_statistics: params.term_statistics,
            routing: params.routing,
            version: params.version,
            version_type: params.version_type,
            filter: params.filter,
            per_field_analyzer: params.per_field_analyzer,
            preference: params.preference,
            realtime: params.realtime,
          },
          {
            opaqueId: "elasticsearch_get_term_vectors",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to get term vectors:", {
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
