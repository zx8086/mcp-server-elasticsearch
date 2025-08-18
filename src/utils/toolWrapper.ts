/* src/utils/toolWrapper.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { zodToJsonSchemaCompat as zodToJsonSchema } from "./zodToJsonSchema.js";
import { logger } from "./logger.js";
import {
  PerformanceMonitor,
  createToolMetadata,
  isTracingActive,
  traceToolExecution,
  withNestedTrace,
} from "./tracing.js";
import { type ToolContext, traceNamedToolExecution } from "./tracingEnhanced.js";

// =============================================================================
// TOOL REGISTRATION WITH TRACING
// =============================================================================

export interface TracedToolOptions {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (esClient: Client, args: any) => Promise<any>;
  operationType?: "read" | "write" | "destructive";
}

export function registerTracedTool(server: McpServer, esClient: Client, options: TracedToolOptions): void {
  const { name, description, inputSchema, handler, operationType = "read" } = options;

  // Convert Zod schema to JSON Schema for MCP SDK
  // The zodToJsonSchema returns the full schema, we just need to pass it correctly
  const jsonSchema = zodToJsonSchema(inputSchema, {
    $refStrategy: "none",
    target: "jsonSchema7",
    // Remove the definitions to avoid reference issues
    removeAdditionalStrategy: "passthrough",
  });

  // Log the converted schema for debugging
  logger.debug(`Converted schema for ${name}:`, JSON.stringify(jsonSchema, null, 2));

  // Parse and validate arguments manually since Zod 4 doesn't have _parse
  // IMPORTANT: MCP SDK behavior varies - handle both parameter passing patterns
  server.tool(name, description, jsonSchema, async (args: any, extra?: any) => {
    // Create performance monitor
    const perfMonitor = new PerformanceMonitor();

    try {
      // Extract actual parameters from arguments (handle MCP SDK variations)
      let actualArgs: any = args;
      
      // Check if args looks like metadata (has signal, requestId, etc.)
      // To avoid false positives, require multiple metadata indicators AND no obvious user data
      const hasMetadataFields = args && typeof args === "object" && 
        ("signal" in args || "requestId" in args || "sessionId" in args);
      
      const hasNestedParams = args && typeof args === "object" &&
        ("arguments" in args || "params" in args || "input" in args);
      
      // Only treat as metadata if it has metadata fields AND either:
      // 1. Has nested parameter objects, OR 
      // 2. Has ONLY metadata fields (no other user-looking data)
      const onlyMetadataFields = hasMetadataFields && Object.keys(args).every(key => 
        ["signal", "requestId", "sessionId", "sendNotification", "sendRequest", "_meta", "authInfo", "requestInfo"].includes(key)
      );
      
      const isMetadata = hasMetadataFields && (hasNestedParams || onlyMetadataFields);
      
      if (isMetadata) {
        // This is metadata, look for parameters in different places
        if (args.arguments && typeof args.arguments === "object") {
          actualArgs = args.arguments;
        } else if (args.params && typeof args.params === "object") {
          actualArgs = args.params;
        } else if (args.input && typeof args.input === "object") {
          actualArgs = args.input;
        } else if (extra && typeof extra === "object" && !("signal" in extra)) {
          actualArgs = extra;
        } else {
          actualArgs = {};
        }
        
        logger.debug(`Tool ${name} detected metadata first, extracted parameters:`, {
          metadataKeys: Object.keys(args),
          extractedArgs: actualArgs,
        });
      }
      
      // Validate arguments using Zod schema
      const validatedArgs = inputSchema.parse(actualArgs);
      
      // If tracing is not active, execute directly
      if (!isTracingActive()) {
        logger.debug(`Executing tool without tracing: ${name}`, { args: validatedArgs });
        const result = await handler(esClient, validatedArgs);

        // Log performance even without tracing
        const metrics = perfMonitor.end();
        if (metrics.duration && metrics.duration > 5000) {
          logger.warn(`Slow tool execution: ${name}`, {
            duration: metrics.duration,
            args: validatedArgs,
          });
        }

        return result;
      }

      // Execute with enhanced tracing
      logger.info(`🔍 Executing tool WITH TRACING: ${name}`, {
        args: validatedArgs,
        tracingActive: isTracingActive(),
      });

      // Use enhanced tracing with client context
      const toolContext: ToolContext = {
        toolName: name,
        // Note: We need to pass session/client info from the server context
        // This would ideally be passed through the tool handler
      };

      const tracedTool = traceNamedToolExecution(toolContext);
      const result = await tracedTool(validatedArgs, async () => {
        // Create tool metadata
        const metadata = createToolMetadata(name, validatedArgs);
        metadata.operationType = operationType;

        // Execute the tool handler
        const toolResult = await handler(esClient, validatedArgs);

        // Add execution metrics
        const metrics = perfMonitor.end();

        // Log slow operations
        perfMonitor.logSlowOperation(5000, name);

        return {
          ...toolResult,
          _metadata: {
            ...metadata,
            executionTime: metrics.duration,
            memoryUsage: metrics.memoryUsage,
          },
        };
      });

      return result;
    } catch (error) {
      const metrics = perfMonitor.end();
      logger.error(`Tool execution failed: ${name}`, {
        error: error instanceof Error ? error.message : String(error),
        duration: metrics.duration,
        args,
      });
      throw error;
    }
  });
}

// =============================================================================
// ELASTICSEARCH OPERATION WRAPPER
// =============================================================================

export async function traceElasticsearchCall<T>(
  operation: string,
  index: string | undefined,
  esOperation: () => Promise<T>,
  metadata?: Record<string, any>,
): Promise<T> {
  if (!isTracingActive()) {
    return esOperation();
  }

  return withNestedTrace(
    `ES: ${operation}`,
    "retriever",
    async () => {
      const perfMonitor = new PerformanceMonitor();

      try {
        const result = await esOperation();

        const metrics = perfMonitor.end();

        logger.debug(`Elasticsearch operation completed: ${operation}`, {
          index,
          duration: metrics.duration,
          ...metadata,
        });

        return result;
      } catch (error) {
        const metrics = perfMonitor.end();

        logger.error(`Elasticsearch operation failed: ${operation}`, {
          index,
          duration: metrics.duration,
          error: error instanceof Error ? error.message : String(error),
          ...metadata,
        });

        throw error;
      }
    },
    {
      operation,
      index,
      ...metadata,
    },
  );
}

// =============================================================================
// BULK OPERATION WRAPPER
// =============================================================================

export async function traceBulkOperation<T>(
  operationName: string,
  itemCount: number,
  bulkOperation: () => Promise<T>,
): Promise<T> {
  if (!isTracingActive()) {
    return bulkOperation();
  }

  return withNestedTrace(
    `Bulk: ${operationName}`,
    "chain",
    async () => {
      const perfMonitor = new PerformanceMonitor();

      logger.info(`Starting bulk operation: ${operationName}`, {
        itemCount,
      });

      try {
        const result = await bulkOperation();

        const metrics = perfMonitor.end();

        logger.info(`Bulk operation completed: ${operationName}`, {
          itemCount,
          duration: metrics.duration,
          itemsPerSecond: itemCount / ((metrics.duration || 1) / 1000),
        });

        return result;
      } catch (error) {
        const metrics = perfMonitor.end();

        logger.error(`Bulk operation failed: ${operationName}`, {
          itemCount,
          duration: metrics.duration,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    },
    {
      operation: operationName,
      itemCount,
    },
  );
}

// =============================================================================
// SEARCH OPERATION WRAPPER
// =============================================================================

export async function traceSearchOperation<T>(
  index: string,
  queryType: string,
  searchOperation: () => Promise<T>,
  query?: any,
): Promise<T> {
  if (!isTracingActive()) {
    return searchOperation();
  }

  return withNestedTrace(
    `Search: ${index}`,
    "retriever",
    async () => {
      const perfMonitor = new PerformanceMonitor();

      logger.debug("Executing search operation", {
        index,
        queryType,
        hasQuery: !!query,
      });

      try {
        const result = await searchOperation();

        const metrics = perfMonitor.end();

        // Extract result count if available
        let resultCount = 0;
        if (result && typeof result === "object") {
          const searchResult = result as any;
          resultCount = searchResult.hits?.total?.value || searchResult.hits?.total || searchResult.count || 0;
        }

        logger.debug("Search operation completed", {
          index,
          queryType,
          resultCount,
          duration: metrics.duration,
        });

        // Log slow queries
        if (metrics.duration && metrics.duration > 3000) {
          logger.warn("Slow search detected", {
            index,
            queryType,
            duration: metrics.duration,
            query: query ? JSON.stringify(query).substring(0, 200) : undefined,
          });
        }

        return result;
      } catch (error) {
        const metrics = perfMonitor.end();

        logger.error("Search operation failed", {
          index,
          queryType,
          duration: metrics.duration,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    },
    {
      index,
      queryType,
      query: query ? JSON.stringify(query).substring(0, 500) : undefined,
    },
  );
}

// =============================================================================
// INDEX MANAGEMENT WRAPPER
// =============================================================================

export async function traceIndexOperation<T>(
  operation: string,
  index: string,
  indexOperation: () => Promise<T>,
): Promise<T> {
  if (!isTracingActive()) {
    return indexOperation();
  }

  return withNestedTrace(
    `Index: ${operation}`,
    "tool",
    async () => {
      const perfMonitor = new PerformanceMonitor();

      logger.info(`Executing index operation: ${operation}`, {
        index,
      });

      try {
        const result = await indexOperation();

        const metrics = perfMonitor.end();

        logger.info(`Index operation completed: ${operation}`, {
          index,
          duration: metrics.duration,
        });

        return result;
      } catch (error) {
        const metrics = perfMonitor.end();

        logger.error(`Index operation failed: ${operation}`, {
          index,
          duration: metrics.duration,
          error: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
    },
    {
      operation,
      index,
    },
  );
}
