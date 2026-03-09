/* src/utils/tracing.ts */

import type { RunTree } from "langsmith/run_trees";
import { getCurrentRunTree, withRunTree } from "langsmith/singletons/traceable";
import { traceable } from "langsmith/traceable";
import { config } from "../config.js";
import { logger } from "./logger.js";
import { getCurrentSession } from "./sessionContext.js";

// =============================================================================
// STATE
// =============================================================================

let isTracingEnabled = false;
let isInitialized = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

export function initializeTracing(): void {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

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
    const endpoint = process.env.LANGSMITH_ENDPOINT || config.langsmith.endpoint;
    const project = process.env.LANGSMITH_PROJECT || config.langsmith.project;

    // Set environment variables for LangSmith SDK (it reads these natively)
    process.env.LANGSMITH_TRACING = "true";
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGSMITH_API_KEY = apiKey;
    process.env.LANGCHAIN_API_KEY = apiKey;
    process.env.LANGSMITH_ENDPOINT = endpoint;
    process.env.LANGCHAIN_ENDPOINT = endpoint;
    process.env.LANGSMITH_PROJECT = project;
    process.env.LANGCHAIN_PROJECT = project;

    isTracingEnabled = true;
    logger.info("LangSmith tracing initialized", { endpoint, project });
  } catch (error) {
    logger.error("Failed to initialize LangSmith tracing", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// QUERIES (used by elasticsearchObservability.ts)
// =============================================================================

export interface TraceMetadata {
  connectionId?: string;
  sessionId?: string;
  conversationId?: string;
  conversationMessageCount?: number;
  isNewConversation?: boolean;
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
  } catch {
    return undefined;
  }
}

// =============================================================================
// TOOL TRACING (consolidated from tracingEnhanced.ts)
// =============================================================================

export function traceToolCall(
  toolName: string,
  toolArgs: any,
  extra: any,
  handler: (toolArgs: any, extra: any) => Promise<any>,
) {
  const project = process.env.LANGSMITH_PROJECT || config.langsmith.project;
  const session = getCurrentSession();
  const sessionId = session?.sessionId || "unknown";
  const connectionId = session?.connectionId || "unknown";
  const clientName = session?.clientInfo?.name || "unknown";

  const toolTracer = traceable(
    async (_inputs: any) => {
      const startTime = Date.now();

      try {
        const result = await handler(toolArgs, extra);
        const executionTime = Date.now() - startTime;

        logger.debug("Tool execution completed", { toolName, executionTime });

        return {
          ...result,
          _trace: { executionTime, project },
        };
      } catch (error) {
        logger.error("Tool execution failed", {
          toolName,
          executionTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      name: toolName,
      run_type: "tool",
      project_name: project,
      metadata: {
        tool_name: toolName,
        session_id: sessionId,
        connection_id: connectionId,
        client_name: clientName,
      },
      tags: ["mcp-tool", `tool:${toolName}`, `client:${clientName.toLowerCase().replace(/\s+/g, "-")}`],
    },
  );

  return (toolTracer as any)({
    tool_name: toolName,
    arguments: toolArgs,
    timestamp: new Date().toISOString(),
  });
}

// Backward-compat alias used by test files that import traceToolExecution
export function traceToolExecution(
  toolName: string,
  toolArgs: any,
  extra: any,
  _context: any,
  handler: (toolArgs: any, extra: any) => Promise<any>,
) {
  return traceToolCall(toolName, toolArgs, extra, handler);
}

// =============================================================================
// CONNECTION TRACING (consolidated from tracingEnhanced.ts)
// =============================================================================

export interface ConnectionContext {
  connectionId: string;
  transportMode: "stdio" | "sse" | "sse-bun" | string;
  clientInfo?: {
    name?: string;
    version?: string;
    platform?: string;
  };
  sessionId?: string;
}

export async function traceConnection(context: ConnectionContext, handler: () => Promise<any>): Promise<any> {
  let traceName = context.clientInfo?.name || (context.transportMode === "stdio" ? "Claude Desktop" : "Web Client");
  traceName += ` (${context.transportMode.toUpperCase()})`;

  if (context.sessionId) {
    const short = context.sessionId.split("-").pop()?.substring(0, 6) || context.sessionId.substring(0, 8);
    traceName += ` [${short}]`;
  }

  const traced = traceable(
    async (_input: any) => {
      const startTime = Date.now();

      logger.info(`Starting MCP session: ${traceName}`, {
        connectionId: context.connectionId,
        transportMode: context.transportMode,
      });

      try {
        const result = await handler();
        logger.info(`MCP session established: ${traceName}`, {
          connectionId: context.connectionId,
          executionTime: Date.now() - startTime,
        });
        return result;
      } catch (error) {
        logger.error(`MCP session failed: ${traceName}`, {
          connectionId: context.connectionId,
          executionTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      name: traceName,
      run_type: "chain",
      metadata: {
        connection_id: context.connectionId,
        transport_mode: context.transportMode,
        client_name: context.clientInfo?.name || "unknown",
        session_id: context.sessionId,
      },
      tags: [
        "mcp-connection",
        `transport:${context.transportMode}`,
        context.clientInfo?.name ? `client:${context.clientInfo.name}` : "client:unknown",
      ],
    },
  );

  return (traced as any)({ connectionId: context.connectionId, timestamp: new Date().toISOString() });
}

// =============================================================================
// NESTED TRACE (used by elasticsearchObservability.ts)
// =============================================================================

export async function withNestedTrace<T>(
  name: string,
  runType: "chain" | "tool" | "retriever" | "llm",
  handler: () => Promise<T>,
): Promise<T> {
  if (!isTracingEnabled) {
    return handler();
  }

  const parentRun = getCurrentRunTree();

  const tracedHandler = traceable(async () => handler(), {
    name,
    run_type: runType,
  });

  if (parentRun) {
    return withRunTree(parentRun, tracedHandler);
  }
  return tracedHandler();
}

// =============================================================================
// CLIENT DETECTION (moved from tracingEnhanced.ts)
// =============================================================================

export function detectClient(
  transportMode: string,
  _headers?: Record<string, string>,
  userAgent?: string,
): { name: string; version?: string; platform?: string } {
  if (transportMode === "stdio") {
    return { name: "Claude Desktop", platform: process.platform };
  }

  if (transportMode === "sse") {
    if (userAgent) {
      if (userAgent.includes("n8n")) return { name: "n8n", platform: "web" };
      if (userAgent.includes("Chrome")) return { name: "Chrome Browser", platform: "web" };
      if (userAgent.includes("Safari")) return { name: "Safari Browser", platform: "web" };
    }
    return { name: "Web Client", platform: "web" };
  }

  return { name: "Unknown Client", platform: "unknown" };
}

export function generateSessionId(_connectionId: string, clientInfo?: { name?: string }): string {
  const timestamp = Date.now();
  const clientPrefix = clientInfo?.name?.toLowerCase().replace(/\s+/g, "-") || "unknown";
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `${clientPrefix}-${timestamp}-${randomSuffix}`;
}
