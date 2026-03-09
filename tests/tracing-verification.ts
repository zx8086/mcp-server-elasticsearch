#!/usr/bin/env bun

/**
 * LangSmith Tracing Verification Script
 * 
 * This script tests that LangSmith tracing works correctly after notification fixes
 * Run with: bun tests/tracing-verification.ts
 */

import { traceable } from "langsmith/traceable";
import { getCurrentRunTree } from "langsmith/singletons/traceable";
import { initializeTracing, traceToolExecution } from "../src/utils/tracing.js";
import { notificationManager } from "../src/utils/notifications.js";
import { logger } from "../src/utils/logger.js";

// Test configuration
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY;
const LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT || "mcp-elasticsearch-test";

console.log("LangSmith Tracing Verification Test");
console.log("=====================================");

// Initialize tracing
initializeTracing();

// Mock MCP server for notifications
const mockServer = {
  sendNotification: async (params: any) => {
    console.log("Mock notification sent:", params.method);
    return Promise.resolve();
  }
};

// Set up notification manager
notificationManager.setServer(mockServer as any);

/**
 * Test 1: Basic tool execution with tracing
 */
const testBasicToolTrace = traceable(
  async (toolName: string) => {
    console.log(`\nTest 1: Basic tool trace for ${toolName}`);
    
    // Simulate a tool handler
    const mockHandler = async (toolArgs: any, extra: any) => {
      console.log("  Tool handler executing...");
      
      // Send notifications during execution
      await notificationManager.sendInfo("Tool started", { tool: toolName });
      await notificationManager.sendProgress({
        progressToken: "test-token",
        progress: 50,
        total: 100,
      });
      await notificationManager.sendInfo("Tool completed", { tool: toolName });
      
      return { content: [{ type: "text", text: "Test result" }] };
    };
    
    // Execute with tracing
    const result = await traceToolExecution(toolName, { test: "arg" }, {}, mockHandler);
    
    console.log("  Tool execution completed");
    console.log("  Result:", result);
    
    return result;
  },
  {
    name: "test_basic_tool_trace",
    run_type: "chain",
    project_name: LANGSMITH_PROJECT,
  }
);

/**
 * Test 2: Verify trace context preservation
 */
const testTraceContextPreservation = traceable(
  async () => {
    console.log("\nTest 2: Trace context preservation");
    
    const startTrace = getCurrentRunTree();
    console.log("  Start trace ID:", startTrace?.id);
    
    // Send notification
    await notificationManager.sendInfo("Testing context preservation", {
      test: "data"
    });
    
    const afterNotificationTrace = getCurrentRunTree();
    console.log("  After notification trace ID:", afterNotificationTrace?.id);
    
    // Verify trace context is preserved
    if (startTrace?.id === afterNotificationTrace?.id) {
      console.log("  Trace context preserved!");
      return { success: true, preserved: true };
    } else {
      console.log("  Trace context lost!");
      return { success: false, preserved: false };
    }
  },
  {
    name: "test_trace_context_preservation", 
    run_type: "chain",
    project_name: LANGSMITH_PROJECT,
  }
);

/**
 * Test 3: Multiple nested operations
 */
const testNestedOperations = traceable(
  async () => {
    console.log("\nTest 3: Nested operations with notifications");
    
    const results = [];
    
    for (let i = 0; i < 3; i++) {
      console.log(`  Operation ${i + 1}/3`);
      
      await notificationManager.sendProgress({
        progressToken: "nested-test",
        progress: (i + 1) * 33,
        total: 100,
      });
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      results.push(`operation-${i + 1}-complete`);
    }
    
    console.log("  All nested operations completed");
    return { results, totalOperations: 3 };
  },
  {
    name: "test_nested_operations",
    run_type: "chain", 
    project_name: LANGSMITH_PROJECT,
  }
);

/**
 * Run all tests
 */
async function runTests() {
  try {
    console.log("Starting tracing verification tests...\n");
    
    // Test 1: Basic tool tracing
    const test1Result = await testBasicToolTrace("elasticsearch_search");
    
    // Test 2: Context preservation  
    const test2Result = await testTraceContextPreservation();
    
    // Test 3: Nested operations
    const test3Result = await testNestedOperations();
    
    console.log("\nTest Summary");
    console.log("===============");
    console.log("Test 1 - Basic Tool Trace:", test1Result ? "PASS" : "FAIL");
    console.log("Test 2 - Context Preservation:", test2Result.preserved ? "PASS" : "FAIL");
    console.log("Test 3 - Nested Operations:", test3Result ? "PASS" : "FAIL");
    
    if (LANGSMITH_API_KEY) {
      console.log(`\nCheck traces in LangSmith project: ${LANGSMITH_PROJECT}`);
    } else {
      console.log("\nSet LANGSMITH_API_KEY to see traces in LangSmith dashboard");
    }
    
    console.log("\nTracing verification completed!");
    
  } catch (error) {
    console.error("\nTest failed:", error);
    process.exit(1);
  }
}

// Run the tests
runTests().then(() => {
  console.log("All tests completed successfully!");
}).catch((error) => {
  console.error("Tests failed:", error);
  process.exit(1);
});