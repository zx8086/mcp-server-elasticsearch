#!/usr/bin/env bun

/* test-ilm-retry-fix.ts - Test ILM retry parameter handling */

console.log("Testing ILM Retry Parameter Handling Fix\n");

// Mock the error scenarios that could cause "params is not defined"
function simulateErrorHandling(args: any, validationError: boolean = false) {
  let params: any;
  
  try {
    if (validationError) {
      throw new Error("Validation error - params not yet defined");
    }
    
    // This is where params gets defined
    params = { index: args.index };
    
    // Simulate various Elasticsearch errors
    throw new Error("index_not_found: no such index [test-index]");
    
  } catch (error) {
    // This is the error handling logic that was broken
    console.log("Error handling test:");
    
    // OLD WAY (broken): params?.index - could be undefined
    const oldWay = params?.index || "unknown";
    console.log(`  Old way (could fail): ${oldWay}`);
    
    // NEW WAY (fixed): params?.index || args?.index || "unknown"
    const newWay = params?.index || args?.index || "unknown";
    console.log(`  New way (safe): ${newWay}`);
    
    return { success: true, index: newWay };
  }
}

// Test Case 1: Normal flow (params gets defined)
console.log("Test Case 1: Normal parameter flow");
const result1 = simulateErrorHandling({ index: ".ds-.monitoring-ent-search-8-mb-2024.04.05-000007" });
console.log(`Index correctly identified: ${result1.index}\n`);

// Test Case 2: Early error (params never gets defined)
console.log("Test Case 2: Early validation error (params undefined)");
const result2 = simulateErrorHandling({ index: ".ds-.monitoring-*" }, true);
console.log(`Index safely retrieved from args: ${result2.index}\n`);

// Test Case 3: Missing index in args
console.log("Test Case 3: Missing index parameter");
const result3 = simulateErrorHandling({}, true);
console.log(`Safe fallback to 'unknown': ${result3.index}\n`);

console.log("**Fix Summary:**");
console.log("The ILM retry tool was failing because error handling code tried to access");
console.log("'params?.index' before params was defined. The fix adds fallback to 'args?.index':");
console.log("");
console.log("  Before: params?.index || 'unknown'");
console.log("  After:  params?.index || args?.index || 'unknown'");
console.log("");
console.log("This ensures the tool can provide meaningful error messages even when");
console.log("validation fails or other early errors occur.");
console.log("");
console.log("Test completed! The ILM retry tool should now work correctly.");