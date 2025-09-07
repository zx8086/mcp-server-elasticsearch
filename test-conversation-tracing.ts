#!/usr/bin/env bun

/* test-conversation-tracing.ts */

import { runWithSession } from "./src/utils/sessionContext.js";
import { traceToolWithConversation, getCurrentConversationInfo } from "./src/utils/tracingEnhanced.js";
import { getOrCreateConversation, forceNewConversation } from "./src/utils/conversationTracker.js";
import { logger } from "./src/utils/logger.js";

// =============================================================================
// CONVERSATION TRACKING TEST FOR LANGSMITH TRACE SEPARATION
// =============================================================================

const SESSION_ID = "test-session-12345";
const CONNECTION_ID = "test-connection-67890";

// Create session context (simulates Claude Desktop connection)
const sessionContext = {
  sessionId: SESSION_ID,
  connectionId: CONNECTION_ID,
  transportMode: "stdio" as const,
  clientInfo: {
    name: "Claude Desktop",
    version: "1.0.0",
    platform: "darwin",
  },
};

async function simulateToolCall(toolName: string, args: any) {
  return traceToolWithConversation(toolName, args, async (toolArgs) => {
    // Simulate tool execution
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      content: [{
        type: "text",
        text: `Simulated result for ${toolName} with args: ${JSON.stringify(toolArgs)}`
      }]
    };
  });
}

async function testConversationSeparation() {
  console.log("🧪 Testing Conversation-Level Tracing for LangSmith Separation\n");

  // Run everything within session context
  await runWithSession(sessionContext, async () => {
    
    // === CONVERSATION 1 ===
    console.log("📝 CONVERSATION 1: Initial search queries");
    
    let convInfo = getCurrentConversationInfo();
    console.log("Conv 1 Info:", {
      id: convInfo?.conversationId?.substring(0, 25) + "...",
      messageCount: convInfo?.conversationMessageCount,
      isNew: convInfo?.isNewConversation,
    });

    await simulateToolCall("elasticsearch_search", { 
      index: "logs-*", 
      query: { match: { message: "error" } } 
    });

    await simulateToolCall("elasticsearch_list_indices", { 
      limit: 10 
    });

    convInfo = getCurrentConversationInfo();
    console.log("Conv 1 Updated:", {
      id: convInfo?.conversationId?.substring(0, 25) + "...",
      messageCount: convInfo?.conversationMessageCount,
      isNew: convInfo?.isNewConversation,
    });

    // Simulate time gap (like user thinking or doing other things)
    console.log("\n⏰ Simulating 4-minute inactivity gap...");
    
    // === CONVERSATION 2 (NEW CHAT) ===
    console.log("\n📝 CONVERSATION 2: New chat - cluster monitoring");
    
    // Force new conversation (simulates clicking "new chat" in Claude Desktop)
    forceNewConversation(SESSION_ID, "user-clicked-new-chat");

    convInfo = getCurrentConversationInfo();
    console.log("Conv 2 Info:", {
      id: convInfo?.conversationId?.substring(0, 25) + "...",
      messageCount: convInfo?.conversationMessageCount,
      isNew: convInfo?.isNewConversation,
    });

    await simulateToolCall("elasticsearch_get_cluster_health", {});

    await simulateToolCall("elasticsearch_get_cluster_stats", {});

    convInfo = getCurrentConversationInfo();
    console.log("Conv 2 Updated:", {
      id: convInfo?.conversationId?.substring(0, 25) + "...",
      messageCount: convInfo?.conversationMessageCount,
      isNew: convInfo?.isNewConversation,
    });

    // === CONVERSATION 3 (ANOTHER NEW CHAT) ===
    console.log("\n📝 CONVERSATION 3: Another new chat - index management");

    // Force another new conversation
    forceNewConversation(SESSION_ID, "user-clicked-new-chat-again");

    convInfo = getCurrentConversationInfo();
    console.log("Conv 3 Info:", {
      id: convInfo?.conversationId?.substring(0, 25) + "...",
      messageCount: convInfo?.conversationMessageCount,
      isNew: convInfo?.isNewConversation,
    });

    await simulateToolCall("elasticsearch_indices_summary", { 
      groupBy: "prefix" 
    });

    await simulateToolCall("elasticsearch_get_mappings", { 
      index: "logs-*" 
    });

    convInfo = getCurrentConversationInfo();
    console.log("Conv 3 Updated:", {
      id: convInfo?.conversationId?.substring(0, 25) + "...",
      messageCount: convInfo?.conversationMessageCount,
      isNew: convInfo?.isNewConversation,
    });
  });

  console.log("\n✅ Test completed!");
  console.log("\n📊 Expected LangSmith Trace Results:");
  console.log("   • Each conversation should appear as separate trace groups");
  console.log("   • Tool names will include conversation identifiers:");
  console.log("     - 'elasticsearch_search [NEW:abc123]' (first tool in new conversation)");
  console.log("     - 'elasticsearch_search [abc123:2]' (second tool in same conversation)");
  console.log("   • Metadata will include conversation_id for filtering/grouping");
  console.log("   • Tags will include 'new-conversation' vs 'continuing-conversation'");
}

// Run the test
if (import.meta.main) {
  testConversationSeparation().catch(error => {
    logger.error("Test failed:", error);
    process.exit(1);
  });
}