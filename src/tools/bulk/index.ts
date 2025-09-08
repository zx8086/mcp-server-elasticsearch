/* src/tools/bulk/index.ts */
import type { Client } from "@elastic/elasticsearch";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, readOnlyManager, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import type { TextContent } from "../types.js";

// Define bulk operations error types
export class BulkOperationError extends Error {
  constructor(
    message: string,
    public readonly operation?: string,
  ) {
    super(message);
    this.name = "BulkOperationError";
  }
}

export class BulkValidationError extends BulkOperationError {
  constructor(reason: string) {
    super(`Bulk operation validation failed: ${reason}`, "validation");
    this.name = "BulkValidationError";
  }
}

export class MultiGetError extends BulkOperationError {
  constructor(reason: string) {
    super(`Multi-get operation failed: ${reason}`, "multi_get");
    this.name = "MultiGetError";
  }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

const bulkOperationsSchema = z.object({
  operations: z.array(z.object({}).passthrough()),
  index: z.string().optional(),
  routing: z.string().optional(),
  pipeline: z.string().optional(),
  refresh: z.string().optional(),
  requireAlias: booleanField().optional(),
  timeout: z.string().optional(),
  waitForActiveShards: z.string().optional(),
  flushBytes: z.number().optional(),
  concurrency: z.number().optional(),
  retries: z.number().optional(),
});

const bulkOperationsImpl = async (client: Client, args: z.infer<typeof bulkOperationsSchema>) => {
  try {
    // Validation: Ensure index is provided globally or per-document
    const hasGlobalIndex = !!args.index;
    const allDocsHaveIndex = args.operations.every((doc) => doc._index);

    if (!hasGlobalIndex && !allDocsHaveIndex) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "You must provide an 'index' parameter or ensure every operation document has a '_index' property.",
      );
    }

    logger.debug("Executing bulk operations", {
      operationCount: args.operations.length,
      globalIndex: args.index,
      pipeline: args.pipeline,
      flushBytes: args.flushBytes,
      concurrency: args.concurrency,
    });

    // Log warning for potentially destructive operation
    logger.warn("🚨 WRITE OPERATION: Bulk operations executing", {
      operationCount: args.operations.length,
      globalIndex: args.index,
      warning: "This may create, update, or delete multiple documents",
    });

    // Use the helper API for better performance and reliability
    const result = await client.helpers.bulk(
      {
        datasource: args.operations,
        onDocument(doc) {
          return {
            index: {
              _index: args.index || doc._index,
              routing: args.routing,
              pipeline: args.pipeline,
              refresh: args.refresh,
              require_alias: args.requireAlias,
              timeout: args.timeout,
              wait_for_active_shards: args.waitForActiveShards,
            },
          };
        },
        flushBytes: args.flushBytes,
        concurrency: args.concurrency,
        retries: args.retries,
        onDrop(doc) {
          logger.warn("Document failed after retries", {
            document: JSON.stringify(doc, null, 2),
          });
        },
      },
      {
        opaqueId: "elasticsearch_bulk_operations",
      },
    );

    logger.info("Bulk operations completed successfully", {
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      time: result.time,
      bytes: result.bytes,
    });

    const responseData = {
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      time: result.time,
      bytes: result.bytes,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(responseData, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error("Failed to perform bulk operations", {
      error: error instanceof Error ? error.message : String(error),
      operationCount: args.operations.length,
    });

    if (error instanceof Error && error.message.includes("index_not_found")) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Index not found: ${args.index || "one or more indices in operations"}`,
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Failed to perform bulk operations: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const bulkOperations = {
  name: "elasticsearch_bulk_operations",
  description:
    "Perform bulk operations in Elasticsearch for high-throughput data ingestion. Best for batch indexing, bulk updates, mass data import, performance optimization. Use when you need to efficiently index, update, or delete large volumes of documents in Elasticsearch.",
  inputSchema: bulkOperationsSchema.shape,
  operationType: OperationType.WRITE as const,
  handler: async (client: Client, args: z.infer<typeof bulkOperationsSchema>) => {
    // Check read-only mode first
    const readOnlyCheck = readOnlyManager.checkOperation("elasticsearch_bulk_operations");
    if (!readOnlyCheck.allowed) {
      return readOnlyManager.createBlockedResponse("elasticsearch_bulk_operations");
    }

    const response = await bulkOperationsImpl(client, args);

    if (readOnlyCheck.warning) {
      return readOnlyManager.createWarningResponse("elasticsearch_bulk_operations", response);
    }

    return response;
  },
};

// ============================================================================
// MULTI GET
// ============================================================================

const multiGetSchema = z.object({
  docs: z
    .array(
      z.object({
        _id: z.string(),
        _index: z.string().optional(),
        _source: z.union([booleanField(), z.array(z.string())]).optional(),
        routing: z.string().optional(),
        stored_fields: z.array(z.string()).optional(),
        version: z.number().optional(),
        version_type: z.enum(["internal", "external", "external_gte", "force"]).optional(),
      }),
    )
    .optional(),
  index: z.string().optional(),
  preference: z.string().optional(),
  realtime: booleanField().optional(),
  refresh: booleanField().optional(),
  routing: z.string().optional(),
  _source: booleanField().optional(),
  _source_excludes: z.array(z.string()).optional(),
  _source_includes: z.array(z.string()).optional(),
});

export const multiGet = {
  name: "elasticsearch_multi_get",
  description:
    "Get multiple documents from Elasticsearch in a single request. Best for batch document retrieval, efficient bulk operations, reducing network overhead. Use when you need to fetch multiple JSON documents by their IDs from Elasticsearch indices in one operation.",
  inputSchema: multiGetSchema.shape,
  operationType: OperationType.READ as const,
  handler: async (client: Client, args: z.infer<typeof multiGetSchema>) => {
    try {
      logger.debug("Executing multi-get operation", {
        docsCount: args.docs?.length,
        globalIndex: args.index,
        preference: args.preference,
        realtime: args.realtime,
      });

      // Validate that docs is provided and not empty
      if (!args.docs || args.docs.length === 0) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'The "docs" parameter must be provided and contain at least one document specification',
        );
      }

      const result = await client.mget({
        docs: args.docs,
        index: args.index,
        preference: args.preference,
        realtime: args.realtime,
        refresh: args.refresh,
        routing: args.routing,
        _source: args._source,
        _source_excludes: args._source_excludes,
        _source_includes: args._source_includes,
      });

      logger.debug("Multi-get operation completed successfully", {
        docsRequested: args.docs.length,
        docsFound: result.docs?.filter((doc) => doc.found).length || 0,
        docsNotFound: result.docs?.filter((doc) => !doc.found).length || 0,
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
      logger.error("Failed to perform multi-get", {
        error: error instanceof Error ? error.message : String(error),
        docsCount: args.docs?.length,
      });

      if (error instanceof Error && error.message.includes("index_not_found")) {
        throw new McpError(ErrorCode.InvalidRequest, `Index not found: ${args.index || "one or more indices in docs"}`);
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to perform multi-get: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

// Export all tools
export const bulkTools = [bulkOperations, multiGet] as const;
