/* src/utils/conversationTracker.ts */

import { logger } from "./logger.js";

// =============================================================================
// CONVERSATION TRACKING FOR LANGSMITH TRACE SEPARATION
// =============================================================================

export interface ConversationContext {
  conversationId: string;
  sessionId: string;
  startTime: number;
  lastActivity: number;
  messageCount: number;
  isNewConversation?: boolean;
}

interface ConversationState {
  conversations: Map<string, ConversationContext>;
  sessionConversations: Map<string, string[]>; // sessionId -> conversationIds
  inactivityThreshold: number; // ms to consider conversation ended
  maxConversationsPerSession: number;
}

const conversationState: ConversationState = {
  conversations: new Map(),
  sessionConversations: new Map(),
  inactivityThreshold: 3 * 60 * 1000, // 3 minutes - shorter for better new chat detection
  maxConversationsPerSession: 20, // Reduced for memory efficiency
};

/**
 * Generate a conversation ID based on timing and session patterns
 */
function generateConversationId(sessionId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `conv_${sessionId.substring(0, 8)}_${timestamp}_${random}`;
}

/**
 * Detect if this is likely a new conversation based on:
 * 1. Time gap since last activity
 * 2. First tool call in session
 * 3. Pattern changes in request types
 */
function detectNewConversation(
  sessionId: string,
  toolName?: string,
  requestPattern?: string
): boolean {
  const sessionConversations = conversationState.sessionConversations.get(sessionId) || [];
  
  // First conversation in session
  if (sessionConversations.length === 0) {
    logger.debug("New conversation detected: first in session", { sessionId });
    return true;
  }

  // Check latest conversation for inactivity
  const latestConvId = sessionConversations[sessionConversations.length - 1];
  const latestConv = conversationState.conversations.get(latestConvId);
  
  if (latestConv) {
    const timeSinceLastActivity = Date.now() - latestConv.lastActivity;
    
    // Long inactivity suggests new conversation
    if (timeSinceLastActivity > conversationState.inactivityThreshold) {
      logger.debug("New conversation detected: inactivity threshold exceeded", {
        sessionId,
        timeSinceLastActivity,
        threshold: conversationState.inactivityThreshold,
      });
      return true;
    }

    // Pattern-based detection for Claude Desktop "new chat"
    // Claude Desktop often starts new conversations with search or list operations
    if (toolName && isConversationStarterTool(toolName) && timeSinceLastActivity > 30000) {
      logger.debug("New conversation detected: starter tool after gap", {
        sessionId,
        toolName,
        timeSinceLastActivity,
      });
      return true;
    }
  }

  return false;
}

/**
 * Tools that commonly start new conversations in Claude Desktop
 */
function isConversationStarterTool(toolName: string): boolean {
  const starterTools = [
    'elasticsearch_search',
    'elasticsearch_list_indices',
    'elasticsearch_get_cluster_health',
    'elasticsearch_get_cluster_stats',
    'elasticsearch_indices_summary',
  ];
  return starterTools.includes(toolName);
}

/**
 * Get or create conversation context for current request
 */
export function getOrCreateConversation(
  sessionId: string,
  toolName?: string,
  forceNew = false
): ConversationContext {
  const isNewConv = forceNew || detectNewConversation(sessionId, toolName);
  
  if (isNewConv) {
    // Create new conversation
    const conversationId = generateConversationId(sessionId);
    const conversation: ConversationContext = {
      conversationId,
      sessionId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      messageCount: 1,
      isNewConversation: true,
    };
    
    // Store conversation
    conversationState.conversations.set(conversationId, conversation);
    
    // Update session conversations
    const sessionConvs = conversationState.sessionConversations.get(sessionId) || [];
    sessionConvs.push(conversationId);
    
    // Limit conversations per session to prevent memory bloat
    if (sessionConvs.length > conversationState.maxConversationsPerSession) {
      const removedConvId = sessionConvs.shift();
      if (removedConvId) {
        conversationState.conversations.delete(removedConvId);
      }
    }
    
    conversationState.sessionConversations.set(sessionId, sessionConvs);
    
    logger.info("New conversation started", {
      conversationId: conversationId.substring(0, 20) + "...",
      sessionId: sessionId.substring(0, 10) + "...",
      toolName,
      sessionConversationCount: sessionConvs.length,
    });
    
    return conversation;
  } else {
    // Update existing conversation
    const sessionConversations = conversationState.sessionConversations.get(sessionId) || [];
    const latestConvId = sessionConversations[sessionConversations.length - 1];
    const conversation = conversationState.conversations.get(latestConvId);
    
    if (conversation) {
      conversation.lastActivity = Date.now();
      conversation.messageCount += 1;
      conversation.isNewConversation = false;
      
      logger.debug("Continuing conversation", {
        conversationId: conversation.conversationId.substring(0, 20) + "...",
        messageCount: conversation.messageCount,
        toolName,
      });
      
      return conversation;
    } else {
      // Fallback: create new conversation if existing one is missing
      return getOrCreateConversation(sessionId, toolName, true);
    }
  }
}

/**
 * Get current conversation for session
 */
export function getCurrentConversation(sessionId: string): ConversationContext | undefined {
  const sessionConversations = conversationState.sessionConversations.get(sessionId) || [];
  const latestConvId = sessionConversations[sessionConversations.length - 1];
  return latestConvId ? conversationState.conversations.get(latestConvId) : undefined;
}

/**
 * Get conversation statistics for session
 */
export function getSessionConversationStats(sessionId: string) {
  const sessionConversations = conversationState.sessionConversations.get(sessionId) || [];
  const conversations = sessionConversations.map(id => conversationState.conversations.get(id)).filter(Boolean);
  
  return {
    totalConversations: conversations.length,
    activeConversations: conversations.filter(c => Date.now() - c.lastActivity < conversationState.inactivityThreshold).length,
    totalMessages: conversations.reduce((sum, c) => sum + c.messageCount, 0),
    longestConversation: Math.max(...conversations.map(c => c.messageCount), 0),
    sessionDuration: conversations.length > 0 ? Date.now() - conversations[0].startTime : 0,
  };
}

/**
 * Clean up old conversations to prevent memory leaks
 */
export function cleanupOldConversations(): void {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
  let cleaned = 0;
  
  for (const [convId, conv] of conversationState.conversations.entries()) {
    if (conv.lastActivity < cutoff) {
      conversationState.conversations.delete(convId);
      cleaned++;
      
      // Remove from session conversations
      const sessionConvs = conversationState.sessionConversations.get(conv.sessionId);
      if (sessionConvs) {
        const index = sessionConvs.indexOf(convId);
        if (index > -1) {
          sessionConvs.splice(index, 1);
          if (sessionConvs.length === 0) {
            conversationState.sessionConversations.delete(conv.sessionId);
          }
        }
      }
    }
  }
  
  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} old conversations`);
  }
}

/**
 * Force start a new conversation (for explicit new chat detection)
 */
export function forceNewConversation(sessionId: string, reason = "manual"): ConversationContext {
  logger.info("Forcing new conversation", { sessionId: sessionId.substring(0, 10) + "...", reason });
  return getOrCreateConversation(sessionId, undefined, true);
}

// Periodic cleanup every hour
setInterval(cleanupOldConversations, 60 * 60 * 1000);