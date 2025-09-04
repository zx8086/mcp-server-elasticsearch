import { type Client } from "@elastic/elasticsearch";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType } from "../../utils/readOnlyMode.js";
import { booleanField } from "../../utils/zodHelpers.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { TextContent } from "../types.js";

// Define mapping-specific error types
export class MappingError extends Error {
  constructor(message: string, public readonly operation?: string) {
    super(message);
    this.name = 'MappingError';
  }
}

export class SqlCursorError extends MappingError {
  constructor(cursor: string, reason: string) {
    super(`Failed to clear SQL cursor ${cursor}: ${reason}`, 'clear_sql_cursor');
    this.name = 'SqlCursorError';
  }
}

export class FieldMappingError extends MappingError {
  constructor(index: string, field: string, reason: string) {
    super(`Failed to get field mapping for ${field} in index ${index}: ${reason}`, 'get_field_mapping');
    this.name = 'FieldMappingError';
  }
}

// ============================================================================
// CLEAR SQL CURSOR
// ============================================================================

const clearSqlCursorSchema = z.object({
  cursor: z.string().min(1, "Cursor cannot be empty"),
});

export const clearSqlCursor = {
  name: 'elasticsearch_clear_sql_cursor',
  description: 'Clear a SQL cursor in Elasticsearch to free resources. Best for resource management, cursor cleanup, memory optimization. Use when you need to explicitly release SQL cursor resources after completing paginated SQL queries in Elasticsearch.',
  inputSchema: clearSqlCursorSchema,
  operationType: OperationType.READ as const,
  handler: async (client: Client, args: z.infer<typeof clearSqlCursorSchema>) => {
    try {
      logger.debug('Clearing SQL cursor', { 
        cursorLength: args.cursor.length 
      });

      const result = await client.sql.clearCursor({
        cursor: args.cursor,
      });

      logger.debug('SQL cursor cleared successfully', { 
        succeeded: result.succeeded 
      });

      return {
        content: [{ 
          type: 'text' as const, 
          text: JSON.stringify(result, null, 2) 
        }]
      };
    } catch (error) {
      logger.error('Failed to clear SQL cursor', { 
        error: error instanceof Error ? error.message : String(error),
        cursorLength: args.cursor.length
      });
      
      if (error instanceof Error && error.message.includes('invalid_cursor')) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid SQL cursor: cursor may be expired or malformed`
        );
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to clear SQL cursor: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

// ============================================================================
// GET FIELD MAPPING
// ============================================================================

const getFieldMappingSchema = z.object({
  index: z.string().min(1, "Index cannot be empty"),
  field: z.string().min(1, "Field name cannot be empty"),
  includeDefaults: booleanField().optional(),
  local: booleanField().optional(),
  ignoreUnavailable: booleanField().optional(),
  allowNoIndices: booleanField().optional(),
  expandWildcards: z.enum(["all", "open", "closed", "hidden", "none"]).optional(),
});

export const getFieldMapping = {
  name: 'elasticsearch_get_field_mapping',
  description: 'Get field mapping for a specific field in an Elasticsearch index. Best for schema inspection, field analysis, mapping troubleshooting. Use when you need to examine how specific fields are mapped and analyzed in Elasticsearch indices for search optimization.',
  inputSchema: getFieldMappingSchema,
  operationType: OperationType.READ as const,
  handler: async (client: Client, args: z.infer<typeof getFieldMappingSchema>) => {
    try {
      logger.debug('Getting field mapping', { 
        index: args.index,
        field: args.field,
        includeDefaults: args.includeDefaults,
        expandWildcards: args.expandWildcards
      });

      const result = await client.indices.getFieldMapping({
        index: args.index,
        fields: args.field,
        include_defaults: args.includeDefaults,
        local: args.local,
        ignore_unavailable: args.ignoreUnavailable,
        allow_no_indices: args.allowNoIndices,
        expand_wildcards: args.expandWildcards,
      });

      logger.debug('Field mapping retrieved successfully', { 
        index: args.index,
        field: args.field,
        mappingExists: Object.keys(result).length > 0
      });

      return {
        content: [{ 
          type: 'text' as const, 
          text: JSON.stringify(result, null, 2) 
        } as TextContent]
      };
    } catch (error) {
      logger.error('Failed to get field mapping', { 
        error: error instanceof Error ? error.message : String(error),
        index: args.index,
        field: args.field
      });
      
      if (error instanceof Error && error.message.includes('index_not_found')) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Index not found: ${args.index}`
        );
      }
      
      if (error instanceof Error && error.message.includes('no such index')) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Index pattern "${args.index}" matches no indices`
        );
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get field mapping: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

// Export all tools
export const mappingTools = [
  clearSqlCursor,
  getFieldMapping
] as const;