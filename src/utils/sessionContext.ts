/* src/utils/sessionContext.ts */

import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "./logger.js";

// =============================================================================
// SESSION CONTEXT MANAGEMENT
// =============================================================================

export interface SessionContext {
  sessionId: string;
  connectionId: string;
  transportMode: "stdio" | "sse";
  clientInfo?: {
    name?: string;
    version?: string;
    platform?: string;
  };
  userId?: string;
  startTime?: number;
}

// Create AsyncLocalStorage to maintain session context across async calls
const sessionStorage = new AsyncLocalStorage<SessionContext>();

export function runWithSession<T>(context: SessionContext, fn: () => T | Promise<T>): T | Promise<T> {
  return sessionStorage.run(context, fn);
}

export function getCurrentSession(): SessionContext | undefined {
  const session = sessionStorage.getStore();
  if (!session) {
    logger.debug("No session context available in AsyncLocalStorage");
  }
  return session;
}

export function getCurrentSessionId(): string | undefined {
  return getCurrentSession()?.sessionId;
}

export function getCurrentClientInfo(): SessionContext["clientInfo"] | undefined {
  return getCurrentSession()?.clientInfo;
}

export function createSessionContext(
  connectionId: string,
  transportMode: "stdio" | "sse",
  sessionId?: string,
  clientInfo?: SessionContext["clientInfo"],
  userId?: string,
): SessionContext {
  return {
    sessionId: sessionId || connectionId,
    connectionId,
    transportMode,
    clientInfo,
    userId,
    startTime: Date.now(),
  };
}

export function logSessionInfo(prefix = "Session Info") {
  const session = getCurrentSession();
  if (session) {
    logger.debug(`${prefix}:`, {
      sessionId: `${session.sessionId?.substring(0, 10)}...`,
      connectionId: `${session.connectionId?.substring(0, 10)}...`,
      client: session.clientInfo?.name || "unknown",
      transport: session.transportMode,
      duration: session.startTime ? Date.now() - session.startTime : 0,
    });
  } else {
    logger.debug(`${prefix}: No active session`);
  }
}
