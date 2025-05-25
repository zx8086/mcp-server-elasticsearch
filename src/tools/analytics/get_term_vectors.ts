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
  doc: z.record(z.any()).optional(),
  fields: z.array(z.string()).optional(),
  fieldStatistics: z.boolean().optional(),
  offsets: z.boolean().optional(),
  payloads: z.boolean().optional(),
  positions: z.boolean().optional(),
  termStatistics: z.boolean().optional(),
  routing: z.string().optional(),
  version: z.number().optional(),
  versionType: z.string().optional(),
  filter: z.record(z.any()).optional(),
  perFieldAnalyzer: z.record(z.any()).optional(),
  preference: z.string().optional(),
  realtime: z.boolean().optional(),
});

type GetTermVectorsParamsType = z.infer<typeof GetTermVectorsParams>;
export const registerGetTermVectorsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "get_term_vectors",
    "Get term vectors for a document in Elasticsearch",
    {
      index: z.string().min(1, "Index is required"),
      id: z.string().optional(),
      doc: z.record(z.any()).optional(),
      fields: z.array(z.string()).optional(),
      fieldStatistics: z.boolean().optional(),
      offsets: z.boolean().optional(),
      payloads: z.boolean().optional(),
      positions: z.boolean().optional(),
      termStatistics: z.boolean().optional(),
      routing: z.string().optional(),
      version: z.number().optional(),
      versionType: z.string().optional(),
      filter: z.record(z.any()).optional(),
      perFieldAnalyzer: z.record(z.any()).optional(),
      preference: z.string().optional(),
      realtime: z.boolean().optional(),
    },
    async (params: GetTermVectorsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.termvectors(
          {
            index: params.index,
            id: params.id,
            doc: params.doc,
            fields: params.fields,
            field_statistics: params.fieldStatistics,
            offsets: params.offsets,
            payloads: params.payloads,
            positions: params.positions,
            term_statistics: params.termStatistics,
            routing: params.routing,
            version: params.version,
            version_type: params.versionType,
            filter: params.filter,
            per_field_analyzer: params.perFieldAnalyzer,
            preference: params.preference,
            realtime: params.realtime,
          },
          {
            opaqueId: "get_term_vectors",
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
