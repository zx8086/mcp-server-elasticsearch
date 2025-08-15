/* src/utils/universalToolWrapper.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ZodObject } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { logger } from "./logger.js";
import { getCurrentSession } from "./sessionContext.js";
import { isTracingActive } from "./tracing.js";
import { PerformanceMonitor } from "./tracing.js";
import { traceNamedToolExecution } from "./tracingEnhanced.js";

// =============================================================================
// UNIVERSAL TOOL WRAPPER WITH AUTOMATIC TRACING
// =============================================================================

/**
 * Wraps ANY MCP tool registration with automatic tracing
 * This intercepts the server.tool() method to add tracing transparently
 */
export function wrapServerWithTracing(server: McpServer): McpServer {
  const originalTool = server.tool.bind(server);

  // Override the tool registration method
  server.tool = (
    name: string,
    description: string,
    inputSchema: z.ZodObject<any> | Record<string, any>,
    handler: (args: any) => Promise<any>,
  ) => {
    logger.debug(`Wrapping tool with tracing: ${name}`);

    // Convert Zod schema to JSON Schema if needed
    let finalSchema = inputSchema;
    if (inputSchema && typeof inputSchema === "object" && "_def" in inputSchema) {
      // This is a Zod schema, convert it
      finalSchema = zodToJsonSchema(inputSchema as ZodObject<any>, {
        $refStrategy: "none",
        target: "jsonSchema7",
      });
    }

    // Create a wrapped handler with tracing
    const wrappedHandler = async (args: any) => {
      const perfMonitor = new PerformanceMonitor();

      try {
        // Check if tracing is active
        if (!isTracingActive()) {
          logger.debug(`Executing tool without tracing: ${name}`, { args });
          const result = await handler(args);

          // Log performance even without tracing
          const metrics = perfMonitor.end();
          if (metrics.duration && metrics.duration > 5000) {
            logger.warn(`Slow tool execution: ${name}`, {
              duration: metrics.duration,
              args,
            });
          }

          return result;
        }

        // Execute with tracing
        const session = getCurrentSession();
        logger.debug(`Executing tool WITH AUTO-TRACING: ${name}`, {
          args,
          tracingActive: true,
          sessionId: session?.sessionId,
          client: session?.clientInfo?.name,
        });

        // Create traced execution with session context
        const toolTrace = traceNamedToolExecution({
          toolName: name,
          connectionId: session?.connectionId,
          sessionId: session?.sessionId,
          clientInfo: session?.clientInfo,
        });

        const result = await toolTrace(args, async () => {
          // Execute the original handler
          const toolResult = await handler(args);

          // Add execution metrics
          const metrics = perfMonitor.end();

          // Log slow operations
          if (metrics.duration && metrics.duration > 5000) {
            logger.warn(`Slow operation detected: ${name}`, {
              duration: metrics.duration,
            });
          }

          return {
            ...toolResult,
            _metadata: {
              toolName: name,
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
    };

    // Register the tool with the wrapped handler and converted schema
    return originalTool(name, description, finalSchema, wrappedHandler);
  };

  return server;
}

// =============================================================================
// ELASTICSEARCH OPERATION WRAPPER FOR ALL TOOLS
// =============================================================================

/**
 * Wraps Elasticsearch client to automatically trace all operations
 */
export function wrapElasticsearchClient(client: Client): Client {
  // Create a proxy to intercept all client operations
  const wrappedClient = new Proxy(client, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      // If it's a function, wrap it with tracing
      if (typeof original === "function") {
        return async (...args: any[]) => {
          if (!isTracingActive()) {
            return original.apply(target, args);
          }

          const operationName = String(prop);
          const perfMonitor = new PerformanceMonitor();

          logger.debug(`ES Operation: ${operationName}`, {
            hasTracing: true,
          });

          try {
            const result = await original.apply(target, args);

            const metrics = perfMonitor.end();
            if (metrics.duration && metrics.duration > 3000) {
              logger.warn(`Slow ES operation: ${operationName}`, {
                duration: metrics.duration,
              });
            }

            return result;
          } catch (error) {
            const metrics = perfMonitor.end();
            logger.error(`ES operation failed: ${operationName}`, {
              duration: metrics.duration,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        };
      }

      // For nested APIs like client.cluster, client.indices, etc.
      if (typeof original === "object" && original !== null) {
        return wrapElasticsearchClient(original as any);
      }

      return original;
    },
  });

  return wrappedClient;
}

// =============================================================================
// BATCH TOOL CONVERSION HELPER
// =============================================================================

/**
 * Registers all tools with automatic tracing
 */
export function registerAllToolsWithTracing(
  server: McpServer,
  esClient: Client,
  toolRegistrationFunctions: Array<(server: McpServer, client: Client) => void>,
) {
  // Wrap the server to add automatic tracing
  const wrappedServer = wrapServerWithTracing(server);

  // Optionally wrap the ES client for operation-level tracing
  // const wrappedClient = wrapElasticsearchClient(esClient);

  // Register all tools with the wrapped server
  let registeredCount = 0;
  let failedCount = 0;

  for (const registerTool of toolRegistrationFunctions) {
    try {
      registerTool(wrappedServer, esClient);
      registeredCount++;
    } catch (error) {
      failedCount++;
      logger.error("Failed to register tool", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info(`✅ Registered ${registeredCount} tools with automatic tracing`, {
    successful: registeredCount,
    failed: failedCount,
    total: toolRegistrationFunctions.length,
  });

  return wrappedServer;
}
