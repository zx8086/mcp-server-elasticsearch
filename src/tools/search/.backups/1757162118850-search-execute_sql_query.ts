/* src/tools/search/execute_sql_query.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const executeSqlQuerySchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "SQL query to execute. Example: 'SELECT * FROM logs-* LIMIT 10'",
    },
    format: {
      type: "string",
      enum: ["json", "csv", "tsv", "txt", "yaml", "cbor", "smile"],
    },
    fetchSize: {
      type: "number",
    },
  },
  additionalProperties: false,
};

// Zod validator for runtime validation
const executeSqlQueryValidator = z.object({
  query: z.string().optional(),
  format: z.enum(["json", "csv", "tsv", "txt", "yaml", "cbor", "smile"]).optional(),
  fetchSize: z.number().optional(),
});

type ExecuteSqlQueryParams = z.infer<typeof executeSqlQueryValidator>;

// MCP error handling
function createExecuteSqlQueryMcpError(error: Error | string, context: { type: string; details?: any }): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_execute_sql_query] ${message}`, context.details);
}

// Tool implementation
export const registerExecuteSqlQueryTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const executeSqlQueryHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = executeSqlQueryValidator.parse(args);

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

      const duration = performance.now() - perfStart;
      if (duration > 5000) {
        logger.warn("Slow operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createExecuteSqlQueryMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      throw createExecuteSqlQueryMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Tool registration
  // Tool registration using modern registerTool method

  server.registerTool(

    "elasticsearch_execute_sql_query",

    {

      title: "Execute Sql Query",

      description: "Execute a SQL query using Elasticsearch SQL API. PARAMETER: 'query' (SQL string). Best for familiar SQL syntax, structured queries, data analysis. Example: {query: 'SELECT * FROM logs-* WHERE status = 500 LIMIT 100'}. Uses direct JSON Schema and standardized MCP error codes.",

      inputSchema: executeSqlQuerySchema,

    },

    executeSqlQueryHandler,

  );
};
