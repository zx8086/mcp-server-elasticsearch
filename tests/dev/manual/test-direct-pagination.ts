#!/usr/bin/env bun

/* Simple direct test of pagination functionality */

import { getConfig } from "./src/config.js";
import { createElasticsearchMcpServer } from "./src/server.js";

async function testPagination() {
  console.log("Testing pagination directly...");
  
  try {
    const config = getConfig();
    const server = await createElasticsearchMcpServer(config);
    
    // Simulate tool call with limit parameter
    const toolHandler = server["_tools"].get("elasticsearch_ilm_get_lifecycle");
    
    if (!toolHandler) {
      console.log("Tool not found");
      return;
    }
    
    console.log("Calling ILM tool with limit: 3, summary: true");
    const result = await toolHandler.handler({ limit: 3, summary: true });
    
    const responseText = result.content[0].text;
    console.log("Response length:", responseText.length);
    
    // Count policy entries
    const policyHeaders = (responseText.match(/### [^#]/g) || []).length;
    console.log(`Found ${policyHeaders} policy entries`);
    
    if (policyHeaders === 3) {
      console.log("PAGINATION WORKING! Got expected 3 results");
    } else {
      console.log(`PAGINATION BROKEN! Expected 3, got ${policyHeaders}`);
    }
    
    // Test with different limit
    console.log("\nCalling ILM tool with limit: 5, summary: true");
    const result2 = await toolHandler.handler({ limit: 5, summary: true });
    
    const responseText2 = result2.content[0].text;
    const policyHeaders2 = (responseText2.match(/### [^#]/g) || []).length;
    console.log(`Found ${policyHeaders2} policy entries`);
    
    if (policyHeaders2 === 5) {
      console.log("PAGINATION WORKING! Got expected 5 results");
    } else {
      console.log(`PAGINATION BROKEN! Expected 5, got ${policyHeaders2}`);
    }
    
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

testPagination().catch(console.error);
