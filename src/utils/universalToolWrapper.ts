/* src/utils/universalToolWrapper.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ZodObject } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getParameterHelpMessage, getSuggestedParameters, toolNeedsParameters } from "./defaultParameters.js";
import { logger } from "./logger.js";
import { createErrorResponse, transformToMCPResponse } from "./mcpCompliantResponse.js";
import { generateParameterHelp, validateParameters } from "./parameterValidator.js";
import { handleLargeResponse } from "./responseHandler.js";
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

  // CRITICAL DEBUG: Log the originalTool to understand its signature
  logger.debug("Universal wrapper initialized:", {
    hasOriginalTool: typeof originalTool === "function",
    originalToolName: originalTool?.name,
    serverType: server.constructor.name,
  });

  // Override the tool registration method
  server.tool = (
    name: string,
    description: string,
    inputSchema: z.ZodObject<any> | Record<string, any>,
    handler: (args: any) => Promise<any>,
  ) => {
    logger.debug(`Wrapping tool with tracing: ${name}`);

    // CRITICAL DEBUG: Check what type of schema we're receiving
    logger.debug(`Schema analysis for tool ${name}:`, {
      schemaType: typeof inputSchema,
      hasDefProperty: inputSchema && typeof inputSchema === "object" && "_def" in inputSchema,
      isZodSchema: inputSchema && typeof inputSchema === "object" && "_def" in inputSchema,
      schemaKeys: inputSchema && typeof inputSchema === "object" ? Object.keys(inputSchema) : null,
      schemaConstructor: inputSchema?.constructor?.name,
    });

    // Convert Zod schema to Pattern 1 format for MCP SDK compatibility
    let finalSchema = inputSchema;
    let validator: (args: any) => any = (args) => args;

    if (inputSchema && typeof inputSchema === "object") {
      // Check if it's a ZodObject
      if ("_def" in inputSchema && (inputSchema as any)._def?.typeName === "ZodObject") {
        // This is a ZodObject - extract the shape for Pattern 1
        const zodObject = inputSchema as z.ZodObject<any>;

        // Extract the shape (Pattern 1 format)
        const shape = (zodObject as any).shape;

        if (shape && typeof shape === "object") {
          logger.debug(`Converting ZodObject to Pattern 1 for tool ${name}`, {
            shapeKeys: Object.keys(shape),
          });

          // Use the raw shape (Pattern 1 - plain object with Zod validators)
          finalSchema = shape;

          // Keep the original ZodObject for validation
          validator = (args: any) => zodObject.parse(args);
        } else {
          // Fallback to JSON Schema conversion
          logger.warn(`Could not extract shape from ZodObject for tool ${name}, using JSON Schema`);
          const convertedSchema = zodToJsonSchema(inputSchema as ZodObject<any>, {
            $refStrategy: "none",
            target: "jsonSchema7",
          });

          // Clean up schema for MCP SDK compatibility
          if (convertedSchema && typeof convertedSchema === "object") {
            if ("$schema" in convertedSchema) {
              convertedSchema.$schema = undefined;
            }
          }

          finalSchema = convertedSchema;
          validator = (args: any) => (inputSchema as z.ZodTypeAny).parse(args);
        }
      } else if ("_def" in inputSchema) {
        // Other Zod types - convert to JSON Schema
        const convertedSchema = zodToJsonSchema(inputSchema as z.ZodTypeAny, {
          $refStrategy: "none",
          target: "jsonSchema7",
        });

        if (convertedSchema && typeof convertedSchema === "object") {
          if ("$schema" in convertedSchema) {
            convertedSchema.$schema = undefined;
          }
        }

        finalSchema = convertedSchema;
        validator = (args: any) => (inputSchema as z.ZodTypeAny).parse(args);
      } else {
        // Check if it's a plain object with Zod validators (Pattern 1)
        const hasZodValidators = Object.values(inputSchema).some(
          (val) => val && typeof val === "object" && "_def" in val,
        );

        if (hasZodValidators) {
          logger.debug(`Pattern 1 detected for tool ${name} - keeping as-is for MCP SDK`, {
            inputSchemaKeys: Object.keys(inputSchema),
            hasZodValidators: true,
          });

          // CRITICAL FIX: For Pattern 1, DON'T convert to JSON Schema
          // The MCP SDK handles Pattern 1 (plain objects with Zod validators) correctly
          // Only ZodObject needs conversion
          finalSchema = inputSchema;

          // Create a validator that validates each field
          validator = (args: any) => {
            const result: any = {};
            const errors: string[] = [];

            for (const [key, fieldSchema] of Object.entries(inputSchema)) {
              if (fieldSchema && typeof fieldSchema === "object" && "_def" in fieldSchema) {
                const zodSchema = fieldSchema as z.ZodTypeAny;
                if (key in args) {
                  try {
                    result[key] = zodSchema.parse(args[key]);
                  } catch (parseError) {
                    errors.push(`${key}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                  }
                } else {
                  const isOptional = typeof zodSchema.isOptional === "function" && zodSchema.isOptional();
                  if (!isOptional) {
                    errors.push(`${key}: Required field is missing`);
                  }
                }
              }
            }

            if (errors.length > 0) {
              throw new Error(`Validation failed:\n${errors.join("\n")}`);
            }

            return result;
          };

          logger.debug(`Pattern 1 tool ${name} will use native MCP SDK handling`);
        }
      }
    }

    // Create a wrapped handler with validation and tracing
    // IMPORTANT: MCP SDK behavior varies based on how it's called:
    // - When called directly (e.g., from tests): parameters are first arg, metadata is second
    // - When called through the protocol (e.g., from Claude): metadata might be first arg with params nested
    const wrappedHandler = async (args: any, extra?: any) => {
      const perfMonitor = new PerformanceMonitor();

      // CRITICAL FIX: The MCP SDK call structure is different than expected
      // Based on analysis, the user parameters may not be in the expected locations
      // Let's try a comprehensive approach to find them
      logger.debug(`MCP call structure analysis for ${name}:`, {
        args_type: typeof args,
        args_keys: args && typeof args === "object" ? Object.keys(args) : null,
        extra_type: typeof extra,
        extra_keys: extra && typeof extra === "object" ? Object.keys(extra) : null,
      });

      // Extract actual parameters from the arguments
      // The MCP SDK might pass arguments in different ways:
      // 1. Direct call: args = parameters, extra = metadata
      // 2. Protocol call: args = metadata with nested parameters
      let actualArgs: any = {};

      // Check if args looks like metadata (has signal, requestId, etc.)
      // To avoid false positives, require multiple metadata indicators AND no obvious user data
      const hasMetadataFields =
        args && typeof args === "object" && ("signal" in args || "requestId" in args || "sessionId" in args);

      const hasNestedParams =
        args && typeof args === "object" && ("arguments" in args || "params" in args || "input" in args);

      // Only treat as metadata if it has metadata fields AND either:
      // 1. Has nested parameter objects, OR
      // 2. Has ONLY metadata fields (no other user-looking data)
      const onlyMetadataFields =
        hasMetadataFields &&
        Object.keys(args).every((key) =>
          [
            "signal",
            "requestId",
            "sessionId",
            "sendNotification",
            "sendRequest",
            "_meta",
            "authInfo",
            "requestInfo",
          ].includes(key),
        );

      const isMetadata = hasMetadataFields && (hasNestedParams || onlyMetadataFields);

      if (isMetadata) {
        // This is metadata, look for parameters in different places
        // Check common locations where MCP SDK might put parameters
        if (args.arguments && typeof args.arguments === "object") {
          actualArgs = args.arguments;
        } else if (args.params && typeof args.params === "object") {
          actualArgs = args.params;
        } else if (args.input && typeof args.input === "object") {
          actualArgs = args.input;
        } else if (extra && typeof extra === "object" && !("signal" in extra)) {
          // Parameters might be in the second argument
          actualArgs = extra;
        } else {
          // No parameters found, use empty object
          actualArgs = {};
        }

        logger.debug(`Tool ${name} called with metadata first, extracted parameters:`, {
          metadataKeys: Object.keys(args),
          extractedArgs: actualArgs,
          extractedKeys: actualArgs && typeof actualArgs === "object" ? Object.keys(actualArgs) : null,
        });
      } else {
        // args is the parameters object
        actualArgs = args || {};
      }

      // SPECIAL CASE: Handle LLMs that incorrectly wrap parameters in 'query' object
      // This happens specifically with nodes/cluster tools when LLMs misinterpret them
      // Only unwrap for specific tools that shouldn't have a 'query' field
      const toolsToUnwrapQuery = [
        "elasticsearch_get_nodes_stats",
        "elasticsearch_get_nodes_info",
        "elasticsearch_get_cluster_health",
        "elasticsearch_get_shards",
        "elasticsearch_list_indices",
        "elasticsearch_ilm_explain_lifecycle",
      ];

      if (
        actualArgs &&
        typeof actualArgs === "object" &&
        actualArgs.query &&
        typeof actualArgs.query === "object" &&
        toolsToUnwrapQuery.includes(name)
      ) {
        logger.warn(`Tool ${name}: Detected incorrect 'query' wrapper for non-search tool, unwrapping parameters`, {
          toolName: name,
          isInList: toolsToUnwrapQuery.includes(name),
          wrappedArgs: actualArgs,
          unwrappedArgs: actualArgs.query,
          originalKeys: Object.keys(actualArgs),
        });

        // Only unwrap if this tool shouldn't have a query field
        if (Object.keys(actualArgs).length === 1) {
          actualArgs = actualArgs.query;
        }
      }

      // Log the received parameters for debugging
      logger.debug(`Tool ${name} called with parameters:`, {
        originalArgs: args,
        actualArgs: actualArgs,
        argsType: typeof actualArgs,
        argsKeys: actualArgs && typeof actualArgs === "object" ? Object.keys(actualArgs) : null,
        isEmpty: actualArgs && typeof actualArgs === "object" ? Object.keys(actualArgs).length === 0 : null,
        hasExtra: !!extra,
        extraKeys: extra && typeof extra === "object" ? Object.keys(extra) : null,
        isMetadata: isMetadata,
      });

      // DISABLED: Complex parameter override logic
      // The issue was here - it was replacing user parameters with defaults
      // Keeping this simple: if user provides parameters, use them as-is

      try {
        // Enhanced validation with helpful error messages
        let validatedArgs: any;
        validatedArgs = validator(actualArgs);

        // Check if tracing is active
        if (!isTracingActive()) {
          logger.debug(`Executing tool without tracing: ${name}`, { args: validatedArgs });
          const result = await handler(validatedArgs);

          // Log performance even without tracing
          const metrics = perfMonitor.end();
          if (metrics.duration && metrics.duration > 5000) {
            logger.warn(`Slow tool execution: ${name}`, {
              duration: metrics.duration,
              args: actualArgs,
            });
          }

          // Transform to MCP-compliant format and handle large responses
          const mcpResponse = transformToMCPResponse(result, name);
          return handleLargeResponse(name, mcpResponse);
        }

        // Execute with tracing
        const session = getCurrentSession();
        logger.debug(`Executing tool WITH AUTO-TRACING: ${name}`, {
          args: validatedArgs,
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

        const result = await toolTrace(validatedArgs, async () => {
          // Execute the original handler
          const toolResult = await handler(validatedArgs);

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

        // Transform to MCP-compliant format and handle large responses
        const mcpResponse = transformToMCPResponse(result, name);
        return handleLargeResponse(name, mcpResponse);
      } catch (error) {
        const metrics = perfMonitor.end();
        logger.error(`Tool execution failed: ${name}`, {
          error: error instanceof Error ? error.message : String(error),
          duration: metrics.duration,
          args,
        });

        // Return MCP-compliant error response instead of throwing
        return createErrorResponse(error instanceof Error ? error : String(error), {
          toolName: name,
          code: "EXECUTION_ERROR",
          details: {
            duration: metrics.duration,
            args: actualArgs,
          },
        });
      }
    };

    // CRITICAL DEBUG: Check finalSchema right before originalTool call
    logger.debug(`Final schema before originalTool for ${name}:`, {
      finalSchemaType: typeof finalSchema,
      finalSchemaHasProperties: finalSchema && typeof finalSchema === "object" && "properties" in finalSchema,
      finalSchemaPropertiesCount:
        finalSchema && typeof finalSchema === "object" && "properties" in finalSchema && finalSchema.properties
          ? Object.keys(finalSchema.properties).length
          : 0,
      finalSchemaKeys: finalSchema && typeof finalSchema === "object" ? Object.keys(finalSchema) : null,
      finalSchemaStringified: JSON.stringify(finalSchema, null, 2),
    });

    // POTENTIAL FIX: Try calling originalTool with explicit parameter structure
    logger.debug(`Calling originalTool for ${name} with parameters:`, {
      name: name,
      description: description,
      hasSchema: !!finalSchema,
      hasHandler: typeof wrappedHandler === "function",
    });

    try {
      const result = originalTool(name, description, finalSchema, wrappedHandler);
      logger.debug(`originalTool call successful for ${name}`);
      return result;
    } catch (error) {
      logger.error(`originalTool call failed for ${name}:`, {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
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
