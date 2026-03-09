/* src/tools/advanced/translate_sql_query.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const TranslateSqlQueryParams = z.object({
  query: z.string().min(1, "SQL query cannot be empty"),
  fetchSize: z.number().optional(),
  timeZone: z.string().optional(),
});

type TranslateSqlQueryParamsType = z.infer<typeof TranslateSqlQueryParams>;
export const registerTranslateSqlQueryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  server.registerTool(
    "elasticsearch_translate_sql_query",

    {
      title: "Translate Sql Query",

      description:
        "Translate a SQL query to Elasticsearch Query DSL using the SQL Translate API. Best for SQL-to-DSL conversion, query optimization, learning Elasticsearch Query DSL. Use when you need to convert familiar SQL syntax to native Elasticsearch queries.",

      inputSchema: TranslateSqlQueryParams.shape,
    },

    async (params: any): Promise<SearchResult> => {
      // Validate params with Zod schema
      const validatedParams = TranslateSqlQueryParams.parse(params) as TranslateSqlQueryParamsType;
      try {
        const result = await esClient.sql.translate({
          query: validatedParams.query,
          fetch_size: validatedParams.fetchSize,
          time_zone: validatedParams.timeZone,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to translate SQL query:", {
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
