/* src/tools/mapping/clear_sql_cursor.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerClearSqlCursorTool(server, esClient) {
  server.tool(
    "clear_sql_cursor",
    "Clear a SQL cursor in Elasticsearch",
    {
      cursor: z.string().min(1, "Cursor is required"),
    },
    async (params) => {
      try {
        const result = await esClient.sql.clearCursor({
          cursor: params.cursor,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to clear SQL cursor:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 