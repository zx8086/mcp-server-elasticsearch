/* src/tools/advanced/translate_sql_query.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";


// Define the parameter schema type
const TranslateSqlQueryParams = z.object({

      query: z.string().min(1, "SQL query is required"),
      fetchSize: z.number().optional(),
      timeZone: z.string().optional(),
    
});

type TranslateSqlQueryParamsType = z.infer<typeof TranslateSqlQueryParams>;
export const registerTranslateSqlQueryTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "translate_sql_query",
    "Translate a SQL query to Elasticsearch DSL using the SQL Translate API",
    {
      query: z.string().min(1, "SQL query is required"),
      fetchSize: z.number().optional(),
      timeZone: z.string().optional(),
    },
    async (params: TranslateSqlQueryParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.sql.translate({
          query: params.query,
          fetch_size: params.fetchSize,
          time_zone: params.timeZone,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to translate SQL query:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 