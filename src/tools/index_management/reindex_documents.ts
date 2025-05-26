/* src/tools/index_management/reindex_documents.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const ReindexDocumentsParams = z.object({
  source: z.object({
    index: z.string(),
    query: z.record(z.any()).optional(),
    size: z.number().optional(),
    sort: z.array(z.record(z.any())).optional(),
  }),
  dest: z.object({
    index: z.string(),
    version_type: z.enum(["internal", "external", "external_gte"]).optional(),
    op_type: z.enum(["index", "create"]).optional(),
  }),
  script: z.record(z.any()).optional(),
  conflicts: z.enum(["abort", "proceed"]).optional(),
  maxDocs: z.number().optional(),
  refresh: z.boolean().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
  waitForCompletion: z.boolean().optional(),
  requestsPerSecond: z.number().optional(),
  scroll: z.string().optional(),
  slices: z.number().optional(),
});

type ReindexDocumentsParamsType = z.infer<typeof ReindexDocumentsParams>;
export const registerReindexDocumentsTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "reindex_documents",
    "Reindex documents in Elasticsearch",
    {
      source: z.object({
        index: z.string(),
        query: z.record(z.any()).optional(),
        size: z.number().optional(),
        sort: z.array(z.record(z.any())).optional(),
      }),
      dest: z.object({
        index: z.string(),
        version_type: z.enum(["internal", "external", "external_gte"]).optional(),
        op_type: z.enum(["index", "create"]).optional(),
      }),
      script: z.record(z.any()).optional(),
      conflicts: z.enum(["abort", "proceed"]).optional(),
      maxDocs: z.number().optional(),
      refresh: z.boolean().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.union([z.literal("all"), z.number().min(1).max(9)]).optional(),
      waitForCompletion: z.boolean().optional(),
      requestsPerSecond: z.number().optional(),
      scroll: z.string().optional(),
      slices: z.number().optional(),
    },
    async (params: ReindexDocumentsParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.reindex({
          source: params.source,
          dest: params.dest,
          script: params.script,
          conflicts: params.conflicts,
          max_docs: params.maxDocs,
          refresh: params.refresh,
          timeout: params.timeout,
          wait_for_active_shards: params.waitForActiveShards,
          wait_for_completion: params.waitForCompletion,
          requests_per_second: params.requestsPerSecond,
          scroll: params.scroll,
          slices: params.slices,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to reindex documents:", {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            } as TextContent,
          ],
        };
      }
    },
  );
};
