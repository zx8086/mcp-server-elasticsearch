/* src/tools/search/execute_sql_query.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult, TextContent } from "../types.js";

// Define the parameter schema type
const ExecuteSqlQueryParams = z.object({
  query: z.string().min(1, "SQL query is required"),
  format: z.enum(["json", "csv", "tsv", "txt", "yaml", "cbor", "smile"]).optional(),
  fetchSize: z.number().optional(),
});

type ExecuteSqlQueryParamsType = z.infer<typeof ExecuteSqlQueryParams>;
export const registerExecuteSqlQueryTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "execute_sql_query",
    "Execute a SQL query using Elasticsearch SQL API",
    {
      query: z.string().min(1, "SQL query is required"),
      format: z.enum(["json", "csv", "tsv", "txt", "yaml", "cbor", "smile"]).optional(),
      fetchSize: z.number().optional(),
    },
    async (params: ExecuteSqlQueryParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.sql.query(
          {
            query: params.query,
            format: params.format,
            fetch_size: params.fetchSize,
          },
          {
            opaqueId: "elasticsearch_execute_sql_query",
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error) {
        logger.error("Failed to execute SQL query:", {
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
