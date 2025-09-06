/* src/utils/tracing.ts */

import { Client as LangSmithClient } from "langsmith";
import type { RunTree } from "langsmith/run_trees";
import { getCurrentRunTree, withRunTree } from "langsmith/singletons/traceable";
import { traceable } from "langsmith/traceable";
import { config } from "../config.js";
import { logger } from "./logger.js";

// =============================================================================
// LANGSMITH CLIENT INITIALIZATION
// =============================================================================

let langsmithClient: LangSmithClient | null = null;
let isTracingEnabled = false;

export function initializeTracing(): void {
  // Also check environment variables directly for runtime configuration
  const tracingEnabled =
    config.langsmith.tracing || process.env.LANGSMITH_TRACING === "true" || process.env.LANGCHAIN_TRACING_V2 === "true";

  const apiKey = config.langsmith.apiKey || process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY;

  if (!tracingEnabled) {
    logger.info("LangSmith tracing is disabled");
    return;
  }

  if (!apiKey) {
    logger.warn("LangSmith tracing is enabled but API key is missing");
    return;
  }

  try {
    // Use environment variables with fallback to config
    const endpoint = process.env.LANGSMITH_ENDPOINT || config.langsmith.endpoint;
    const project = process.env.LANGSMITH_PROJECT || config.langsmith.project;

    // Set environment variables for LangSmith SDK
    process.env.LANGSMITH_TRACING = "true";
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGSMITH_API_KEY = apiKey;
    process.env.LANGCHAIN_API_KEY = apiKey;
    process.env.LANGSMITH_ENDPOINT = endpoint;
    process.env.LANGCHAIN_ENDPOINT = endpoint;
    process.env.LANGSMITH_PROJECT = project;
    process.env.LANGCHAIN_PROJECT = project;

    // Initialize LangSmith client with EXPLICIT project routing
    langsmithClient = new LangSmithClient({
      apiKey: apiKey,
      apiUrl: endpoint,
      projectName: project, // CRITICAL: Explicit project routing to prevent traces going to wrong project
    });

    isTracingEnabled = true;
    logger.info("✅ LangSmith tracing initialized", {
      endpoint: endpoint,
      project: project,
      source: "MCP Server",
    });
  } catch (error) {
    logger.error("Failed to initialize LangSmith tracing", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// TRACING UTILITIES
// =============================================================================

export interface TraceMetadata {
  connectionId?: string;
  sessionId?: string;
  transportMode?: string;
  toolName?: string;
  index?: string;
  operation?: string;
  queryType?: string;
  resultCount?: number;
  executionTime?: number;
  error?: string;
  [key: string]: any;
}

export function isTracingActive(): boolean {
  return isTracingEnabled;
}

export function getCurrentTrace(): RunTree | undefined {
  if (!isTracingEnabled) return undefined;

  try {
    return getCurrentRunTree(true);
  } catch (error) {
    logger.debug("No active trace context", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

// =============================================================================
// MCP CONNECTION TRACING
// =============================================================================

export const traceMcpConnection = traceable(
  async (
    connectionId: string,
    transportMode: string,
    handler: () => Promise<any>,
    clientInfo?: { name?: string; version?: string },
  ) => {
    const startTime = Date.now();

    logger.debug("Starting MCP connection trace", {
      connectionId,
      transportMode,
      clientInfo,
    });

    try {
      const result = await handler();

      const executionTime = Date.now() - startTime;
      logger.debug("MCP connection completed", {
        connectionId,
        executionTime,
        clientInfo,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error("MCP connection failed", {
        connectionId,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
        clientInfo,
      });
      throw error;
    }
  },
  {
    name: "MCP Connection",
    run_type: "chain",
  },
);

// =============================================================================
// TOOL EXECUTION TRACING
// =============================================================================

export function traceToolExecution(
  toolName: string,
  toolArgs: any,
  extra: any,
  handler: (toolArgs: any, extra: any) => Promise<any>,
) {
  // Get configured project for consistent routing
  const project = process.env.LANGSMITH_PROJECT || config.langsmith.project;

  // Create a traceable function with the specific tool name and project
  const toolTracer = traceable(
    async (inputs: any) => {
      const startTime = Date.now();
      const currentRun = getCurrentRunTree();

      logger.debug("Executing tool with tracing", {
        toolName,
        project,
        hasParentTrace: !!currentRun,
        parentTraceId: currentRun?.id,
        toolArgsProvided: !!toolArgs,
        toolArgKeys: toolArgs ? Object.keys(toolArgs) : [],
        limitParam: toolArgs?.limit,
        summaryParam: toolArgs?.summary,
        extraProvided: !!extra,
        extraKeys: extra ? Object.keys(extra) : [],
        // Deep inspection of all args
        fullToolArgs: toolArgs,
        fullExtra: extra,
      });

      try {
        const result = await handler(toolArgs, extra);

        const executionTime = Date.now() - startTime;
        logger.debug("Tool execution completed", {
          toolName,
          project,
          executionTime,
          hasResult: !!result,
        });

        return {
          ...result,
          _trace: {
            runId: currentRun?.id,
            executionTime,
            project,
          },
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error("Tool execution failed", {
          toolName,
          project,
          executionTime,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      name: toolName, // Use the dynamic tool name
      run_type: "tool",
      project_name: project, // CRITICAL: Ensure traces go to correct project
    },
  );

  // Pass the toolArgs as inputs to the trace AND execute the function
  return toolTracer({
    tool_name: toolName,
    arguments: toolArgs,
    extra_context: extra,
    timestamp: new Date().toISOString(),
  });
}

// =============================================================================
// ELASTICSEARCH OPERATION TRACING
// =============================================================================

export const traceElasticsearchOperation = traceable(
  async (operation: string, index: string | undefined, query: any, handler: () => Promise<any>) => {
    const startTime = Date.now();

    logger.debug("Executing Elasticsearch operation", {
      operation,
      index,
      hasQuery: !!query,
    });

    try {
      const result = await handler();

      const executionTime = Date.now() - startTime;
      logger.debug("Elasticsearch operation completed", {
        operation,
        index,
        executionTime,
        resultCount: result?.hits?.total?.value || result?.count || 0,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error("Elasticsearch operation failed", {
        operation,
        index,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
  {
    name: "Elasticsearch Operation",
    run_type: "retriever",
  },
);

// =============================================================================
// NESTED OPERATION TRACING
// =============================================================================

export async function withNestedTrace<T>(
  name: string,
  runType: "chain" | "tool" | "retriever" | "llm",
  handler: () => Promise<T>,
  metadata?: TraceMetadata,
): Promise<T> {
  if (!isTracingEnabled) {
    return handler();
  }

  const parentRun = getCurrentRunTree();

  const tracedHandler = traceable(
    async () => {
      logger.debug(`Starting nested trace: ${name}`, {
        hasParent: !!parentRun,
        parentId: parentRun?.id,
        metadata,
      });

      return handler();
    },
    {
      name,
      run_type: runType,
    },
  );

  if (parentRun) {
    return withRunTree(parentRun, tracedHandler);
  }
  return tracedHandler();
}

// =============================================================================
// TRACE METADATA HELPERS
// =============================================================================

export function createToolMetadata(toolName: string, args: any, connectionId?: string): TraceMetadata {
  const metadata: TraceMetadata = {
    toolName,
    connectionId,
    timestamp: new Date().toISOString(),
  };

  // Extract common fields from args
  if (args?.index) metadata.index = args.index;
  if (args?.operation) metadata.operation = args.operation;
  if (args?.queryBody) metadata.queryType = "query_dsl";
  if (args?.query) metadata.queryType = "sql";

  return metadata;
}

export function createConnectionMetadata(
  connectionId: string,
  transportMode: string,
  sessionId?: string,
): TraceMetadata {
  return {
    connectionId,
    sessionId,
    transportMode,
    timestamp: new Date().toISOString(),
  };
}

// =============================================================================
// PERFORMANCE MONITORING
// =============================================================================

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics;

  constructor() {
    this.metrics = {
      startTime: Date.now(),
      memoryUsage: process.memoryUsage(),
    };
  }

  end(): PerformanceMetrics {
    this.metrics.endTime = Date.now();
    this.metrics.duration = this.metrics.endTime - this.metrics.startTime;
    this.metrics.memoryUsage = process.memoryUsage();
    return this.metrics;
  }

  logSlowOperation(threshold: number, operation: string): void {
    const duration = Date.now() - this.metrics.startTime;
    if (duration > threshold) {
      logger.warn(`Slow operation detected: ${operation}`, {
        duration,
        threshold,
      });
    }
  }
}

// =============================================================================
// FEEDBACK INTEGRATION
// =============================================================================

export async function submitFeedback(
  runId: string,
  score: -1 | 0 | 1,
  comment?: string,
  metadata?: Record<string, any>,
): Promise<void> {
  if (!isTracingEnabled || !langsmithClient) {
    logger.debug("Cannot submit feedback: tracing not enabled");
    return;
  }

  try {
    await langsmithClient.createFeedback(runId, "user_rating", {
      score,
      comment,
      sourceInfo: {
        ...metadata,
        timestamp: new Date().toISOString(),
        source: "mcp-elasticsearch-server",
      },
    });

    logger.debug("Feedback submitted successfully", {
      runId,
      score,
    });
  } catch (error) {
    logger.error("Failed to submit feedback", {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize tracing on module load
initializeTracing();
