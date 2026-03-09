#!/usr/bin/env bun

/* Simple validation test for pagination fix */

import { spawn } from "child_process";

console.log("Testing pagination fix validation...");

// Create JSON-RPC request to test ILM tool with limit=3
const testRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "elasticsearch_ilm_get_lifecycle",
    arguments: { limit: 3, summary: true }
  }
};

console.log("Sending request:", JSON.stringify(testRequest, null, 2));

const child = spawn("bun", ["run", "dist/index.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, LOG_LEVEL: "debug" }
});

let responseReceived = false;
const timeout = setTimeout(() => {
  if (!responseReceived) {
    console.log("Test timed out after 15 seconds");
    child.kill();
    process.exit(1);
  }
}, 15000);

child.stdout.on('data', (data) => {
  const responseText = data.toString().trim();
  
  if (responseText.includes('"result"')) {
    responseReceived = true;
    clearTimeout(timeout);
    
    try {
      const response = JSON.parse(responseText);
      
      if (response.result?.content?.[0]?.text) {
        const content = response.result.content[0].text;
        console.log("Response received, length:", content.length);
        
        // Count policy entries (look for "### " headers)
        const policyCount = (content.match(/### [^#]/g) || []).length;
        console.log(`Found ${policyCount} policy entries`);
        
        if (policyCount === 3) {
          console.log("PAGINATION FIX SUCCESS! Got exactly 3 policies as requested");
        } else {
          console.log(`PAGINATION STILL BROKEN! Expected 3, got ${policyCount}`);
        }
      } else {
        console.log("Unexpected response format");
      }
    } catch (e) {
      console.log("Failed to parse response:", e.message);
    }
    
    child.kill();
    process.exit(0);
  }
});

child.stderr.on('data', (data) => {
  const logText = data.toString();
  
  // Look for our debug logs to confirm parameter passing
  if (logText.includes('limitParam')) {
    console.log("Debug log found - checking parameter passing...");
    if (logText.includes('"limitParam":3')) {
      console.log("Parameters are being passed correctly!");
    }
  }
});

// Send the test request
child.stdin.write(JSON.stringify(testRequest) + '\n');