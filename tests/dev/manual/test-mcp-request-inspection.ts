#!/usr/bin/env bun

/* Deep inspection of MCP request structure */

import { spawn } from "child_process";

console.log("🔍 Deep MCP request structure inspection...");

const testRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "elasticsearch_ilm_get_lifecycle",
    arguments: { limit: 3, summary: true }  // ← Tool arguments should be here
  }
};

console.log("📝 Sending request structure:");
console.log(JSON.stringify(testRequest, null, 2));

const child = spawn("bun", ["run", "dist/index.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, LOG_LEVEL: "debug" }
});

child.stderr.on('data', (data) => {
  const logText = data.toString();
  
  // Look for any debug logs that might show the full argument structure
  if (logText.includes('fullToolArgs') || logText.includes('ILM Handler received')) {
    console.log("🔍 Full debug log:");
    console.log(logText);
  }
});

child.stdout.on('data', (data) => {
  console.log("📤 Server response received");
  child.kill();
  process.exit(0);
});

// Send the test request after server startup
setTimeout(() => {
  console.log("📤 Sending MCP request...");
  child.stdin.write(JSON.stringify(testRequest) + '\n');
}, 3000);

setTimeout(() => {
  console.log("❌ Timeout - killing process");
  child.kill();
  process.exit(1);
}, 10000);