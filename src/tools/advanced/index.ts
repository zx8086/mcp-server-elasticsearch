/* src/tools/advanced/index.ts */
import type { Client } from "@elastic/elasticsearch";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { WaitForActiveShards } from "../types.js";

// Define advanced operations error types
export class AdvancedOperationError extends Error {
  constructor(
    message: string,
    public readonly operation?: string,
  ) {
    super(message);
    this.name = "AdvancedOperationError";
  }
}

export class QueryTranslationError extends AdvancedOperationError {
  constructor(sqlQuery: string, reason: string) {
    super(`Failed to translate SQL query: ${reason}. Query: ${sqlQuery}`);
    this.name = "QueryTranslationError";
  }
}

export class DeleteByQueryError extends AdvancedOperationError {
  constructor(index: string, reason: string) {
    super(`Delete by query failed on index ${index}: ${reason}`, "delete_by_query");
    this.name = "DeleteByQueryError";
  }
}

// ============================================================================
// DELETE BY QUERY
// ============================================================================

const deleteByQuerySchema = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  query: z.object({}).passthrough(),
  maxDocs: z.number().optional(),
  conflicts: z.enum(["abort", "proceed"]).optional(),
  refresh: booleanField().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.custom<WaitForActiveShards>().optional(),
  waitForCompletion: booleanField().optional(),
  requestsPerSecond: z.number().optional(),
  scroll: z.string().optional(),
  scrollSize: z.number().optional(),
  searchType: z.enum(["query_then_fetch", "dfs_query_then_fetch"]).optional(),
  searchTimeout: z.string().optional(),
  slices: z.number().optional(),
});

const deleteByQueryImpl = async (client: Client, args: z.infer<typeof deleteByQuerySchema>) => {
  try {
    logger.debug("Executing delete by query operation", {
      index: args.index,
      maxDocs: args.maxDocs,
      conflicts: args.conflicts,
      requestsPerSecond: args.requestsPerSecond,
    });

    // Log warning for potentially destructive operation
    logger.warn("🚨 DESTRUCTIVE OPERATION: Delete by query executing", {
      index: args.index,
      query: JSON.stringify(args.query),
      maxDocs: args.maxDocs,
    });

    const result = await client.deleteByQuery({
      index: args.index,
      query: args.query,
      max_docs: args.maxDocs,
      conflicts: args.conflicts,
      refresh: args.refresh,
      timeout: args.timeout,
      wait_for_active_shards: args.waitForActiveShards,
      wait_for_completion: args.waitForCompletion,
      requests_per_second: args.requestsPerSecond,
      scroll: args.scroll,
      scroll_size: args.scrollSize,
      search_type: args.searchType,
      search_timeout: args.searchTimeout,
      slices: args.slices,
    });

    logger.info("Delete by query completed successfully", {
      index: args.index,
      deleted: result.deleted,
      batches: result.batches,
      versionConflicts: result.version_conflicts,
      took: result.took,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error("Failed to execute delete by query", {
      error: error instanceof Error ? error.message : String(error),
      index: args.index,
      query: JSON.stringify(args.query),
    });

    if (error instanceof Error && error.message.includes("index_not_found")) {
      throw new McpError(ErrorCode.InvalidRequest, `Index not found: ${args.index}`);
    }

    if (error instanceof Error && error.message.includes("parsing_exception")) {
      throw new McpError(ErrorCode.InvalidRequest, `Invalid query syntax: ${error.message}`);
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to delete by query: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const deleteByQuery = {
  name: "elasticsearch_delete_by_query",
  description:
    "Delete documents by query in Elasticsearch. Best for bulk document deletion, data cleanup, removing documents matching specific criteria. Use when you need to delete multiple documents based on query conditions rather than individual document IDs in Elasticsearch.",
  inputSchema: deleteByQuerySchema.shape,
  operationType: OperationType.DELETE as const,
  handler: withReadOnlyCheck("elasticsearch_delete_by_query", deleteByQueryImpl, OperationType.DELETE),
};

// ============================================================================
// TRANSLATE SQL QUERY
// ============================================================================

const translateSqlQuerySchema = z.object({
  query: z.string().min(1, "SQL query cannot be empty"),
  fetchSize: z.number().optional(),
  timeZone: z.string().optional(),
});

export const translateSqlQuery = {
  name: "elasticsearch_translate_sql_query",
  description:
    "Translate a SQL query to Elasticsearch Query DSL using the SQL Translate API. Best for SQL-to-DSL conversion, query optimization, learning Elasticsearch Query DSL. Use when you need to convert familiar SQL syntax to native Elasticsearch queries.",
  inputSchema: translateSqlQuerySchema.shape,
  operationType: OperationType.WRITE as const,
  handler: async (client: Client, args: z.infer<typeof translateSqlQuerySchema>) => {
    try {
      logger.debug("Translating SQL query to Elasticsearch DSL", {
        queryLength: args.query.length,
        fetchSize: args.fetchSize,
        timeZone: args.timeZone,
      });

      const result = await client.sql.translate({
        query: args.query,
        fetch_size: args.fetchSize,
        time_zone: args.timeZone,
      });

      logger.debug("SQL query translation completed successfully", {
        hasQuery: !!result.query,
        hasSize: !!result.size,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Failed to translate SQL query", {
        error: error instanceof Error ? error.message : String(error),
        query: args.query.substring(0, 200) + (args.query.length > 200 ? "..." : ""),
      });

      if (error instanceof Error && error.message.includes("parsing_exception")) {
        throw new McpError(ErrorCode.InvalidRequest, `Invalid SQL syntax: ${error.message}`);
      }

      if (error instanceof Error && error.message.includes("verification_exception")) {
        throw new McpError(ErrorCode.InvalidRequest, `SQL verification failed: ${error.message}`);
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to translate SQL query: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

// Export all tools
export const advancedTools = [deleteByQuery, translateSqlQuery] as const;
