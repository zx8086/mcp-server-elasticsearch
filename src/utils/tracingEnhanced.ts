/* src/utils/tracingEnhanced.ts */

import { getCurrentRunTree } from "langsmith/singletons/traceable";
import { traceable } from "langsmith/traceable";
import { logger } from "./logger.js";
import { isTracingActive } from "./tracing.js";

// =============================================================================
// ENHANCED CONNECTION TRACING WITH CLIENT IDENTIFICATION
// =============================================================================

export interface ConnectionContext {
  connectionId: string;
  transportMode: "stdio" | "sse";
  clientInfo?: {
    name?: string;
    version?: string;
    platform?: string;
  };
  sessionId?: string;
  userId?: string;
}

/**
 * Creates a properly named MCP connection trace based on client context
 */
export function createNamedConnectionTrace(context: ConnectionContext) {
  // Build a descriptive name based on available information
  let traceName = "";

  // Add client identification
  if (context.clientInfo?.name) {
    traceName = `${context.clientInfo.name}`;
    if (context.clientInfo.version) {
      traceName += ` v${context.clientInfo.version}`;
    }
  } else if (context.transportMode === "stdio") {
    traceName = "Claude Desktop";
  } else if (context.transportMode === "sse") {
    traceName = "Web Client";
  } else {
    traceName = "Unknown Client";
  }

  // Add transport mode
  traceName += ` (${context.transportMode.toUpperCase()})`;

  // Add session identifier - prefer sessionId, fallback to connectionId
  if (context.sessionId) {
    // Use a meaningful prefix from sessionId (e.g., first 8 chars or after last dash)
    const sessionParts = context.sessionId.split("-");
    const sessionIdentifier =
      sessionParts.length > 2
        ? sessionParts[sessionParts.length - 1].substring(0, 6) // Last segment
        : context.sessionId.substring(0, 8); // First 8 chars
    traceName += ` [${sessionIdentifier}]`;
  } else if (context.connectionId) {
    const shortConnId = context.connectionId.split("-").pop() || context.connectionId.substring(0, 8);
    traceName += ` [${shortConnId}]`;
  }

  return traceName;
}

/**
 * Enhanced MCP connection tracing with better naming
 */
export const traceNamedMcpConnection = (context: ConnectionContext) => {
  const traceName = createNamedConnectionTrace(context);

  return traceable(
    async (handler: () => Promise<any>) => {
      const startTime = Date.now();

      logger.info(`🔗 Starting MCP session: ${traceName}`, {
        connectionId: context.connectionId,
        transportMode: context.transportMode,
        clientInfo: context.clientInfo,
        sessionId: context.sessionId,
      });

      try {
        const result = await handler();

        const executionTime = Date.now() - startTime;
        logger.info(`✅ MCP session established: ${traceName}`, {
          connectionId: context.connectionId,
          executionTime,
        });

        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`❌ MCP session failed: ${traceName}`, {
          connectionId: context.connectionId,
          executionTime,
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
        client_version: context.clientInfo?.version || "unknown",
        session_id: context.sessionId,
        user_id: context.userId,
      },
      tags: [
        "mcp-connection",
        `transport:${context.transportMode}`,
        context.clientInfo?.name ? `client:${context.clientInfo.name}` : "client:unknown",
      ],
    },
  );
};

// =============================================================================
// ENHANCED TOOL EXECUTION TRACING
// =============================================================================

export interface ToolContext {
  toolName: string;
  connectionId?: string;
  sessionId?: string;
  clientInfo?: {
    name?: string;
    version?: string;
  };
}

/**
 * Creates a properly named tool execution trace
 */
export function createNamedToolTrace(context: ToolContext) {
  let traceName = `📊 ${context.toolName}`;

  // Add both client AND session context for better tracking
  if (context.clientInfo?.name) {
    traceName += ` (${context.clientInfo.name}`;

    // Also add session ID for grouping
    if (context.sessionId) {
      const sessionParts = context.sessionId.split("-");
      const sessionIdentifier =
        sessionParts.length > 2
          ? sessionParts[sessionParts.length - 1].substring(0, 6)
          : context.sessionId.substring(0, 8);
      traceName += ` ${sessionIdentifier}`;
    }
    traceName += ")";
  } else if (context.sessionId) {
    // If no client info, just use session
    const sessionParts = context.sessionId.split("-");
    const sessionIdentifier =
      sessionParts.length > 2
        ? sessionParts[sessionParts.length - 1].substring(0, 6)
        : context.sessionId.substring(0, 8);
    traceName += ` [${sessionIdentifier}]`;
  }

  return traceName;
}

/**
 * Enhanced tool execution tracing with better naming
 */
export const traceNamedToolExecution = (context: ToolContext) => {
  const traceName = createNamedToolTrace(context);

  return traceable(
    async (args: any, handler: () => Promise<any>) => {
      const startTime = Date.now();
      const currentRun = getCurrentRunTree();

      logger.debug(`🔧 Executing: ${traceName}`, {
        toolName: context.toolName,
        hasParentTrace: !!currentRun,
        parentTraceId: currentRun?.id,
        connectionId: context.connectionId,
        args,
      });

      try {
        const result = await handler();

        const executionTime = Date.now() - startTime;
        logger.debug(`✅ Completed: ${traceName}`, {
          toolName: context.toolName,
          executionTime,
          hasResult: !!result,
        });

        return {
          ...result,
          _trace: {
            runId: currentRun?.id,
            executionTime,
            toolName: context.toolName,
          },
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`❌ Failed: ${traceName}`, {
          toolName: context.toolName,
          executionTime,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      name: traceName,
      run_type: "tool",
      metadata: {
        tool_name: context.toolName,
        connection_id: context.connectionId,
        session_id: context.sessionId,
        client_name: context.clientInfo?.name,
        client_version: context.clientInfo?.version,
      },
      tags: [
        "mcp-tool",
        `tool:${context.toolName}`,
        context.clientInfo?.name ? `client:${context.clientInfo.name}` : null,
      ].filter(Boolean) as string[],
    },
  );
};

// =============================================================================
// CLIENT DETECTION UTILITIES
// =============================================================================

/**
 * Detects the client type from connection context
 */
export function detectClient(
  transportMode: string,
  _headers?: Record<string, string>,
  userAgent?: string,
): { name: string; version?: string; platform?: string } {
  // Check for Claude Desktop
  if (transportMode === "stdio") {
    // Claude Desktop typically uses stdio
    return {
      name: "Claude Desktop",
      platform: process.platform,
    };
  }

  // Check for web clients
  if (transportMode === "sse") {
    if (userAgent) {
      // Parse user agent for client info
      if (userAgent.includes("n8n")) {
        return { name: "n8n", platform: "web" };
      }
      if (userAgent.includes("Chrome")) {
        return { name: "Chrome Browser", platform: "web" };
      }
      if (userAgent.includes("Safari")) {
        return { name: "Safari Browser", platform: "web" };
      }
    }
    return { name: "Web Client", platform: "web" };
  }

  return { name: "Unknown Client", platform: "unknown" };
}

/**
 * Generates a session ID based on connection context
 */
export function generateSessionId(_connectionId: string, clientInfo?: { name?: string }): string {
  const timestamp = Date.now();
  const clientPrefix = clientInfo?.name?.toLowerCase().replace(/\s+/g, "-") || "unknown";
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  return `${clientPrefix}-${timestamp}-${randomSuffix}`;
}
