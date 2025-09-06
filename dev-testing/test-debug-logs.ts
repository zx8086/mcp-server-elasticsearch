#!/usr/bin/env bun

/* Test to capture debug logs and see parameter flow */

import { spawn } from "child_process";

console.log("🧪 Testing parameter flow with debug logs...");

const testRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "elasticsearch_ilm_get_lifecycle",
    arguments: { limit: 3, summary: true }
  }
};

console.log("📝 Sending request with limit: 3");

const child = spawn("bun", ["run", "dist/index.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, LOG_LEVEL: "debug" }
});

let logCapture = "";
let responseReceived = false;

const timeout = setTimeout(() => {
  if (!responseReceived) {
    console.log("❌ Test timed out - analyzing captured logs...");
    console.log("📋 Captured logs analysis:");
    
    if (logCapture.includes("limitParam")) {
      const limitMatches = logCapture.match(/"limitParam":(\d+)/g);
      console.log("🔍 Found limitParam values:", limitMatches);
    } else {
      console.log("❌ No limitParam found in logs");
    }
    
    if (logCapture.includes("Getting ILM lifecycle policies")) {
      const ilmLogs = logCapture.match(/Getting ILM lifecycle policies.*?\n/g);
      console.log("🔍 ILM tool logs:", ilmLogs);
    } else {
      console.log("❌ No ILM tool execution found");
    }
    
    child.kill();
    process.exit(1);
  }
}, 10000);

child.stderr.on('data', (data) => {
  const logText = data.toString();
  logCapture += logText;
  
  // Print relevant debug logs
  if (logText.includes('Executing tool with tracing') || 
      logText.includes('Getting ILM lifecycle policies') ||
      logText.includes('limitParam')) {
    console.log("📋 Debug:", logText.trim());
  }
});

child.stdout.on('data', (data) => {
  const responseText = data.toString().trim();
  
  if (responseText.includes('"result"')) {
    responseReceived = true;
    clearTimeout(timeout);
    
    try {
      const response = JSON.parse(responseText);
      
      if (response.result?.content?.[0]?.text) {
        const content = response.result.content[0].text;
        const policyCount = (content.match(/### [^#]/g) || []).length;
        console.log(`📊 Final result: ${policyCount} policies returned`);
        
        if (policyCount === 3) {
          console.log("✅ SUCCESS!");
        } else {
          console.log(`❌ FAILED! Expected 3, got ${policyCount}`);
        }
      }
    } catch (e) {
      console.log("❌ Response parse error:", e.message);
    }
    
    child.kill();
    process.exit(0);
  }
});

// Wait a moment for server startup, then send request
setTimeout(() => {
  child.stdin.write(JSON.stringify(testRequest) + '\n');
}, 3000);