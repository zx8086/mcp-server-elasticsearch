/* src/tools/mapping/clear_sql_cursor.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";

// Define the parameter schema type
const ClearSqlCursorParams = z.object({
  cursor: z.string().min(1, "Cursor is required"),
});

type ClearSqlCursorParamsType = z.infer<typeof ClearSqlCursorParams>;
export const registerClearSqlCursorTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  server.tool(
    "clear_sql_cursor",
    "Clear a SQL cursor in Elasticsearch",
    {
      cursor: z.string().min(1, "Cursor is required"),
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
