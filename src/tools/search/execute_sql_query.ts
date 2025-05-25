/* src/tools/search/execute_sql_query.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerExecuteSqlQueryTool(server, esClient) {
  server.tool(
    "execute_sql_query",
    "Execute a SQL query using Elasticsearch SQL API",
    {
      query: z.string().min(1, "SQL query is required"),
      format: z.string().optional(),
      fetchSize: z.number().optional(),
    },
    async (params) => {
      try {
        const result = await esClient.sql.query({
          query: params.query,
          format: params.format,
          fetch_size: params.fetchSize,
        }, {
          opaqueId: 'execute_sql_query'
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to execute SQL query:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 