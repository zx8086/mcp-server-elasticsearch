/* src/tools/mapping/clear_sql_cursor.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Define the parameter schema type
const ClearSqlCursorParams = z.object({
  cursor: z.string().min(1, "Cursor cannot be empty"),
});

type ClearSqlCursorParamsType = z.infer<typeof ClearSqlCursorParams>;
export const registerClearSqlCursorTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_clear_sql_cursor",

    {
      title: "Clear Sql Cursor",

      description:
        "Clear a SQL cursor in Elasticsearch to free resources. Best for resource management, cursor cleanup, memory optimization. Use when you need to explicitly release SQL cursor resources after completing paginated SQL queries in Elasticsearch.",

      inputSchema: {
        cursor: z.string().min(1, "Cursor cannot be empty"),
      },
    },

    async (params: ClearSqlCursorParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.sql.clearCursor({
          cursor: params.cursor,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        logger.error("Failed to clear SQL cursor:", {
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
