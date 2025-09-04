#!/usr/bin/env bun

/**
 * Debug the finalSchema variable right before originalTool() call
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function debugFinalSchema() {
  console.log('🔍 Debugging finalSchema right before originalTool() call...\n');
  
  try {
    // Create client with debug logging
    const transport = new StdioClientTransport({
      command: "bun",
      args: ["./dist/index.js"],
      env: {
        ...process.env,
        LOG_LEVEL: "debug"
      }
    });

    const client = new Client({
      name: "debug-final-schema-client",
      version: "1.0.0"
    }, {
      capabilities: {}
    });

    console.log('🔗 Connecting to server...');
    await client.connect(transport);
    
    // Get tool schemas from the client perspective
    const tools = await client.listTools();
    
    console.log('=== SCHEMAS AS SEEN BY CLIENT ===');
    
    const zodTool = tools.tools.find(t => t.name === 'elasticsearch_list_indices');
    const plainTool = tools.tools.find(t => t.name === 'plain_elasticsearch_list_indices');
    
    if (zodTool) {
      console.log('🧬 Zod tool schema (should have converted properties):');
      console.log('Schema type:', typeof zodTool.inputSchema);
      console.log('Properties keys:', zodTool.inputSchema?.properties ? Object.keys(zodTool.inputSchema.properties) : 'NO PROPERTIES');
      console.log('Full schema:', JSON.stringify(zodTool.inputSchema, null, 2));
    }
    
    if (plainTool) {
      console.log('\n📄 Plain tool schema (should have properties):');
      console.log('Schema type:', typeof plainTool.inputSchema);
      console.log('Properties keys:', plainTool.inputSchema?.properties ? Object.keys(plainTool.inputSchema.properties) : 'NO PROPERTIES');
      console.log('Full schema:', JSON.stringify(plainTool.inputSchema, null, 2));
    }
    
    console.log('\n=== COMPARISON ===');
    console.log('Zod tool has properties:', !!(zodTool?.inputSchema?.properties && Object.keys(zodTool.inputSchema.properties).length > 0));
    console.log('Plain tool has properties:', !!(plainTool?.inputSchema?.properties && Object.keys(plainTool.inputSchema.properties).length > 0));
    
    if (zodTool?.inputSchema?.properties && Object.keys(zodTool.inputSchema.properties).length === 0) {
      console.log('❌ PROBLEM: Zod tool schema has empty properties - conversion failed to reach client');
    }
    
    if (plainTool?.inputSchema?.properties && Object.keys(plainTool.inputSchema.properties).length > 0) {
      console.log('✅ Plain tool schema has properties - this should work');
    }

    await client.close();
    
  } catch (error) {
    console.error('💥 Debug failed:', error.message);
  }
}

debugFinalSchema();