/* src/utils/sessionManager.ts */

import { logger } from "./logger.js";

// =============================================================================
// SESSION MANAGEMENT FOR LANGSMITH TRACING
// =============================================================================

export interface Session {
  sessionId: string;
  connectionId: string;
  startTime: number;
  lastActivity: number;
  messageCount: number;
  clientInfo?: {
    name?: string;
    version?: string;
    platform?: string;
  };
  metadata?: {
    [key: string]: any;
  };
}

export interface SessionManagerConfig {
  sessionTimeoutMs: number; // Timeout before creating new session
  enableSessionTracking: boolean;
  includeSessionInTraceName: boolean;
  maxSessions: number; // Limit concurrent sessions
  conversationDetectionThresholdMs: number; // Gap threshold for detecting new conversations
}

const DEFAULT_CONFIG: SessionManagerConfig = {
  sessionTimeoutMs: 30 * 1000, // 30 seconds - much shorter for conversation detection
  enableSessionTracking: true,
  includeSessionInTraceName: false,
  maxSessions: 100, // Prevent memory leaks
  conversationDetectionThresholdMs: 30 * 1000, // 30 second gap indicates new conversation
};

export class SessionManager {
  private sessions = new Map<string, Session>();
  private currentSessionId: string | null = null;
  private config: SessionManagerConfig;

  constructor(config: Partial<SessionManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Start cleanup timer
    setInterval(() => this.cleanupExpiredSessions(), 60000); // Every minute
    
    logger.info("📋 SessionManager initialized", {
      timeoutMs: this.config.sessionTimeoutMs,
      enabled: this.config.enableSessionTracking,
      maxSessions: this.config.maxSessions,
    });
  }

  /**
   * Gets or creates a session based on activity patterns
   */
  getCurrentSession(
    connectionId: string,
    clientInfo?: Session["clientInfo"],
    forceNew = false,
  ): Session {
    if (!this.config.enableSessionTracking) {
      // If session tracking disabled, use connection-based session
      return this.getOrCreateConnectionSession(connectionId, clientInfo);
    }

    const now = Date.now();

    // Check if current session exists and determine if we should continue it
    if (!forceNew && this.currentSessionId) {
      const currentSession = this.sessions.get(this.currentSessionId);
      if (currentSession) {
        const timeSinceLastActivity = now - currentSession.lastActivity;
        
        // Use conversation detection threshold for better chat session separation
        const thresholdMs = this.config.conversationDetectionThresholdMs || this.config.sessionTimeoutMs;
        
        if (timeSinceLastActivity < thresholdMs) {
          // Update activity and return existing session
          currentSession.lastActivity = now;
          currentSession.messageCount++;
          
          logger.debug("📋 Using existing session", {
            sessionId: currentSession.sessionId.substring(0, 8) + "...",
            timeSinceLastActivity: Math.floor(timeSinceLastActivity / 1000) + "s",
            messageCount: currentSession.messageCount,
            thresholdSeconds: Math.floor(thresholdMs / 1000),
          });
          
          return currentSession;
        } else {
          // Gap detected - this indicates a new conversation
          logger.info("🔄 Conversation gap detected - creating new session", {
            gapSeconds: Math.floor(timeSinceLastActivity / 1000),
            thresholdSeconds: Math.floor(thresholdMs / 1000),
            previousSessionId: currentSession.sessionId.substring(0, 8) + "...",
          });
        }
      }
    }

    // Create new session
    const newSession = this.createNewSession(connectionId, clientInfo);
    logger.info("🆕 Created new chat session", {
      sessionId: newSession.sessionId.substring(0, 8) + "...",
      connectionId: connectionId.substring(0, 8) + "...",
      reason: forceNew ? "forced" : "timeout",
      clientName: clientInfo?.name || "unknown",
    });

    return newSession;
  }

  /**
   * Creates a new session
   */
  private createNewSession(
    connectionId: string,
    clientInfo?: Session["clientInfo"],
  ): Session {
    const timestamp = Date.now();
    const sessionId = this.generateSessionId(connectionId, clientInfo);
    
    const session: Session = {
      sessionId,
      connectionId,
      startTime: timestamp,
      lastActivity: timestamp,
      messageCount: 1,
      clientInfo,
      metadata: {
        createdAt: new Date().toISOString(),
        userAgent: clientInfo?.name,
      },
    };

    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;

    // Cleanup old sessions if we hit the limit
    if (this.sessions.size > this.config.maxSessions) {
      this.cleanupOldestSessions();
    }

    return session;
  }

  /**
   * Fallback: create session based on connection ID
   */
  private getOrCreateConnectionSession(
    connectionId: string,
    clientInfo?: Session["clientInfo"],
  ): Session {
    let session = this.sessions.get(connectionId);
    
    if (!session) {
      const timestamp = Date.now();
      session = {
        sessionId: connectionId,
        connectionId,
        startTime: timestamp,
        lastActivity: timestamp,
        messageCount: 1,
        clientInfo,
        metadata: {
          createdAt: new Date().toISOString(),
          sessionTrackingDisabled: true,
        },
      };
      
      this.sessions.set(connectionId, session);
      this.currentSessionId = connectionId;
    } else {
      session.lastActivity = Date.now();
      session.messageCount++;
    }

    return session;
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(
    connectionId: string,
    clientInfo?: Session["clientInfo"],
  ): string {
    const timestamp = Date.now();
    const clientPrefix = clientInfo?.name?.toLowerCase().replace(/\s+/g, "-") || "session";
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const connSuffix = connectionId.split("-").pop()?.substring(0, 4) || "0000";
    
    return `${clientPrefix}-${timestamp}-${connSuffix}-${randomSuffix}`;
  }

  /**
   * Force create a new session (e.g., when user explicitly starts new chat)
   */
  forceNewSession(
    connectionId: string,
    clientInfo?: Session["clientInfo"],
  ): Session {
    return this.getCurrentSession(connectionId, clientInfo, true);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session metadata
   */
  updateSessionMetadata(sessionId: string, metadata: Record<string, any>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata = { ...session.metadata, ...metadata };
    }
  }

  /**
   * Mark session as ended
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata = {
        ...session.metadata,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - session.startTime,
      };
      
      logger.info("🏁 Session ended", {
        sessionId: sessionId.substring(0, 8) + "...",
        duration: Math.floor((Date.now() - session.startTime) / 1000) + "s",
        messageCount: session.messageCount,
      });
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(
      (session) => now - session.lastActivity < this.config.sessionTimeoutMs,
    );
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastActivity;
      
      if (age > this.config.sessionTimeoutMs * 2) { // Double timeout for cleanup
        this.sessions.delete(sessionId);
        cleanedCount++;
        
        // Reset current session if it was cleaned up
        if (this.currentSessionId === sessionId) {
          this.currentSessionId = null;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.debug("🧹 Cleaned up expired sessions", {
        cleanedCount,
        activeSessions: this.sessions.size,
      });
    }
  }

  /**
   * Clean up oldest sessions when hitting limit
   */
  private cleanupOldestSessions(): void {
    const sessionsArray = Array.from(this.sessions.entries());
    
    // Sort by last activity (oldest first)
    sessionsArray.sort(([, a], [, b]) => a.lastActivity - b.lastActivity);
    
    // Remove oldest 20% of sessions
    const toRemove = Math.floor(sessionsArray.length * 0.2);
    
    for (let i = 0; i < toRemove; i++) {
      const [sessionId] = sessionsArray[i];
      this.sessions.delete(sessionId);
      
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
    }

    logger.debug("🧹 Cleaned up oldest sessions", {
      removedCount: toRemove,
      activeSessions: this.sessions.size,
    });
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    currentSessionId: string | null;
    oldestSessionAge: number;
    config: SessionManagerConfig;
  } {
    const now = Date.now();
    const activeSessions = this.getActiveSessions();
    const oldestSession = Array.from(this.sessions.values())
      .sort((a, b) => a.startTime - b.startTime)[0];

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      currentSessionId: this.currentSessionId,
      oldestSessionAge: oldestSession ? now - oldestSession.startTime : 0,
      config: this.config,
    };
  }

  /**
   * Enable or disable session tracking
   */
  setSessionTracking(enabled: boolean): void {
    this.config.enableSessionTracking = enabled;
    logger.info(`📋 Session tracking ${enabled ? "enabled" : "disabled"}`);
  }
}

// =============================================================================
// GLOBAL SESSION MANAGER INSTANCE
// =============================================================================

let globalSessionManager: SessionManager | null = null;

export function initializeSessionManager(config?: Partial<SessionManagerConfig>): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager(config);
  }
  return globalSessionManager;
}

export function getGlobalSessionManager(): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager();
  }
  return globalSessionManager;
}