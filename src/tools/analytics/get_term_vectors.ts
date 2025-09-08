/* src/tools/analytics/get_term_vectors.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { type SearchResult, TextContent, type ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const GetTermVectorsParams = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  id: z.string().optional(),
  doc: z.object({}).passthrough().optional(),
  fields: z.array(z.string()).optional(),
  field_statistics: booleanField().optional(),
  offsets: booleanField().optional(),
  payloads: booleanField().optional(),
  positions: booleanField().optional(),
  term_statistics: booleanField().optional(),
  routing: z.string().optional(),
  version: z.number().optional(),
  version_type: z.enum(["internal", "external", "external_gte", "force"]).optional(),
  filter: z.object({}).passthrough().optional(),
  per_field_analyzer: z.record(z.string()).optional(),
  preference: z.string().optional(),
  realtime: booleanField().optional(),
});

type GetTermVectorsParamsType = z.infer<typeof GetTermVectorsParams>;
export const registerGetTermVectorsTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_get_term_vectors",

    {

      title: "Get Term Vectors",

      description: "Get term vectors for a document in Elasticsearch. Best for text analysis, relevance tuning, similarity calculations. Use when you need to analyze term frequency, positions, and offsets for document text analysis in Elasticsearch.",

      inputSchema: GetTermVectorsParams.shape,

    },

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

  );;
};
