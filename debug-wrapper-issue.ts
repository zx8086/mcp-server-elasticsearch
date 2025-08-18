#!/usr/bin/env bun

/**
 * Debug what's happening in the universal tool wrapper
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function debugWrapper() {
  console.log('🐛 Debugging universal wrapper parameter passing...\n');
  
  try {
    // Create client with more detailed logging
    const transport = new StdioClientTransport({
      command: "bun",
      args: ["./dist/index.js"],
      env: {
        ...process.env,
        LOG_LEVEL: "debug"
      }
    });

    const client = new Client({
      name: "debug-wrapper-client",
      version: "1.0.0"
    }, {
      capabilities: {}
    });

    console.log('🔗 Connecting to server...');
    await client.connect(transport);
    
    // Get tool schema to see what the client sees
    const tools = await client.listTools();
    const plainTool = tools.tools.find(t => t.name === 'plain_elasticsearch_list_indices');
    
    if (plainTool) {
      console.log('🔧 Plain tool schema as seen by client:');
      console.log(JSON.stringify(plainTool.inputSchema, null, 2));
      
      console.log('\n--- Making tool call with parameters ---');
      console.log('Sending parameters:', {
        indexPattern: '*debug*',
        limit: 10,
        excludeSystemIndices: false
      });
      
      // Make the call and look for debug logs
      const result = await client.callTool({
        name: 'plain_elasticsearch_list_indices',
        arguments: {
          indexPattern: '*debug*', 
          limit: 10,
          excludeSystemIndices: false
        }
      });
      
      console.log('\n📄 Result received:');
      const text = result?.content?.[0]?.text || '';
      console.log(text.substring(0, 500));
      
    } else {
      console.log('❌ Plain tool not found');
    }

    await client.close();
    
  } catch (error) {
    console.error('💥 Debug failed:', error.message);
  }
}

debugWrapper();
