/* src/utils/tracingEnhanced.ts */

import { getCurrentRunTree } from "langsmith/singletons/traceable";
import { traceable } from "langsmith/traceable";
import { logger } from "./logger.js";
import { isTracingActive } from "./tracing.js";
import { getCurrentSession } from "./sessionContext.js";
import { getOrCreateConversation } from "./conversationTracker.js";

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
        logger.info(`MCP session established: ${traceName}`, {
          connectionId: context.connectionId,
          executionTime,
        });

        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`MCP session failed: ${traceName}`, {
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
  conversationId?: string;
  conversationMessageCount?: number;
  isNewConversation?: boolean;
  clientInfo?: {
    name?: string;
    version?: string;
  };
}

export function createNamedToolTrace(context: ToolContext) {
  let traceName = `${context.toolName}`;

  // Add conversation context for better trace separation in LangSmith
  if (context.conversationId) {
    const conversationParts = context.conversationId.split("_");
    const conversationIdentifier = conversationParts.length > 3 
      ? conversationParts[conversationParts.length - 1].substring(0, 6) // Random suffix
      : context.conversationId.substring(0, 8);
    
    // Show new conversation indicator
    if (context.isNewConversation) {
      traceName += ` [NEW:${conversationIdentifier}]`;
    } else {
      traceName += ` [${conversationIdentifier}:${context.conversationMessageCount}]`;
    }
  } else if (context.clientInfo?.name) {
    // Fallback to client + session for legacy support
    traceName += ` (${context.clientInfo.name}`;
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
    // If no conversation or client info, just use session
    const sessionParts = context.sessionId.split("-");
    const sessionIdentifier =
      sessionParts.length > 2
        ? sessionParts[sessionParts.length - 1].substring(0, 6)
        : context.sessionId.substring(0, 8);
    traceName += ` [${sessionIdentifier}]`;
  }

  return traceName;
}

export const traceNamedToolExecution = (context: ToolContext) => {
  const traceName = createNamedToolTrace(context);

  return traceable(
    async (args: any, handler: () => Promise<any>) => {
      const startTime = Date.now();
      const currentRun = getCurrentRunTree();

      logger.debug(`Executing: ${traceName}`, {
        toolName: context.toolName,
        hasParentTrace: !!currentRun,
        parentTraceId: currentRun?.id,
        connectionId: context.connectionId,
        args,
      });

      try {
        const result = await handler();

        const executionTime = Date.now() - startTime;
        logger.debug(`Completed: ${traceName}`, {
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
        logger.error(`Failed: ${traceName}`, {
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
        conversation_id: context.conversationId,
        conversation_message_count: context.conversationMessageCount,
        is_new_conversation: context.isNewConversation,
        client_name: context.clientInfo?.name,
        client_version: context.clientInfo?.version,
      },
      tags: [
        "mcp-tool",
        `tool:${context.toolName}`,
        context.clientInfo?.name ? `client:${context.clientInfo.name}` : null,
        context.conversationId ? `conversation:${context.conversationId.split("_").pop()?.substring(0, 6)}` : null,
        context.isNewConversation ? "new-conversation" : "continuing-conversation",
      ].filter(Boolean) as string[],
    },
  );
};

// =============================================================================
// CLIENT DETECTION UTILITIES
// =============================================================================

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

export function generateSessionId(_connectionId: string, clientInfo?: { name?: string }): string {
  const timestamp = Date.now();
  const clientPrefix = clientInfo?.name?.toLowerCase().replace(/\s+/g, "-") || "unknown";
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  return `${clientPrefix}-${timestamp}-${randomSuffix}`;
}

// =============================================================================
// CONVERSATION-AWARE TRACING FOR LANGSMITH
// =============================================================================

export function traceToolWithConversation(
  toolName: string,
  toolArgs: any,
  handler: (toolArgs: any) => Promise<any>,
) {
  // Get current session context
  const session = getCurrentSession();
  if (!session) {
    logger.debug("No session context available for conversation tracing", { toolName });
    
    // Fallback to basic tool tracing without conversation context
    const basicContext: ToolContext = {
      toolName,
      connectionId: "unknown",
      sessionId: "unknown",
    };
    
    const tracer = traceNamedToolExecution(basicContext);
    return tracer(toolArgs, handler);
  }

  // Get or create conversation context for this tool call
  const conversation = getOrCreateConversation(session.sessionId, toolName);
  
  // Enhanced trace context with conversation information
  const conversationContext: ToolContext = {
    toolName,
    connectionId: session.connectionId,
    sessionId: session.sessionId,
    conversationId: conversation.conversationId,
    conversationMessageCount: conversation.messageCount,
    isNewConversation: conversation.isNewConversation,
    clientInfo: session.clientInfo,
  };

  logger.debug("Tracing tool with conversation context for LangSmith", {
    toolName,
    sessionId: session.sessionId.substring(0, 10) + "...",
    conversationId: conversation.conversationId.substring(0, 20) + "...",
    messageCount: conversation.messageCount,
    isNew: conversation.isNewConversation,
    client: session.clientInfo?.name,
  });

  // Execute with enhanced tracing context
  const tracer = traceNamedToolExecution(conversationContext);
  return tracer(toolArgs, handler);
}

export function getCurrentConversationInfo() {
  const session = getCurrentSession();
  if (!session) return null;

  const conversation = getOrCreateConversation(session.sessionId);
  return {
    conversationId: conversation.conversationId,
    conversationMessageCount: conversation.messageCount,
    isNewConversation: conversation.isNewConversation,
    sessionId: session.sessionId,
  };
}

// =============================================================================
// BACKWARD-COMPATIBLE CONVERSATION-AWARE TRACING
// =============================================================================

export function traceToolExecutionWithConversation(
  toolName: string,
  toolArgs: any,
  extra: any,
  contextSession: any, // This matches the original context parameter
  handler: (toolArgs: any, extra: any) => Promise<any>, // Exact same handler signature
) {
  // Get current session context for conversation tracking
  const session = getCurrentSession();
  if (!session) {
    logger.debug("No session context available, using fallback tracing", { toolName });
    
    // Fallback to basic context-based tracing
    const basicContext: ToolContext = {
      toolName,
      connectionId: contextSession?.connectionId || "unknown",
      sessionId: contextSession?.sessionId || "unknown",
    };
    
    const tracer = traceNamedToolExecution(basicContext);
    return tracer(toolArgs, async () => handler(toolArgs, extra));
  }

  // Get or create conversation context for this tool call
  const conversation = getOrCreateConversation(session.sessionId, toolName);
  
  // Enhanced trace context with conversation information
  const conversationContext: ToolContext = {
    toolName,
    connectionId: session.connectionId,
    sessionId: session.sessionId,
    conversationId: conversation.conversationId,
    conversationMessageCount: conversation.messageCount,
    isNewConversation: conversation.isNewConversation,
    clientInfo: session.clientInfo,
  };

  logger.debug("Tool execution with conversation-aware tracing", {
    toolName,
    sessionId: session.sessionId.substring(0, 10) + "...",
    conversationId: conversation.conversationId.substring(0, 20) + "...",
    messageCount: conversation.messageCount,
    isNew: conversation.isNewConversation,
    client: session.clientInfo?.name,
  });

  // Execute with enhanced tracing context, maintaining exact same handler signature
  const tracer = traceNamedToolExecution(conversationContext);
  return tracer(toolArgs, async () => handler(toolArgs, extra));
}
