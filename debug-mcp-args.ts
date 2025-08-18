#!/usr/bin/env bun

// Debug script to understand MCP SDK argument passing
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

console.log("🔍 MCP Argument Debug Tool");

// Create a test server
const server = new McpServer({
  name: "debug-server",
  version: "1.0.0",
});

// Register a simple debug tool
server.tool(
  "debug_tool",
  "Debug tool to inspect MCP argument passing",
  {
    type: "object",
    properties: {
      testParam: { type: "string", description: "Test parameter" },
      anotherParam: { type: "number", description: "Another parameter" }
    },
    additionalProperties: false
  },
  async (args: any, extra?: any) => {
    console.log("\n=== DEBUG TOOL CALLED ===");
    console.log("args (first parameter):", JSON.stringify(args, null, 2));
    console.log("args type:", typeof args);
    console.log("args keys:", args && typeof args === "object" ? Object.keys(args) : "N/A");
    
    console.log("\nextra (second parameter):", JSON.stringify(extra, null, 2));
    console.log("extra type:", typeof extra);
    console.log("extra keys:", extra && typeof extra === "object" ? Object.keys(extra) : "N/A");
    
    // Check for nested parameter structures
    console.log("\n=== NESTED STRUCTURE ANALYSIS ===");
    if (args && typeof args === "object") {
      for (const [key, value] of Object.entries(args)) {
        console.log(`args.${key}:`, JSON.stringify(value, null, 2));
      }
    }
    
    if (extra && typeof extra === "object") {
      for (const [key, value] of Object.entries(extra)) {
        console.log(`extra.${key}:`, JSON.stringify(value, null, 2));
      }
    }
    
    console.log("=== END DEBUG ===\n");
    
    return {
      content: [
        {
          type: "text",
          text: `Debug complete. Check console for argument structure details.`
        }
      ]
    };
  }
);

console.log("Debug tool registered. This tool will log all MCP argument structures.");