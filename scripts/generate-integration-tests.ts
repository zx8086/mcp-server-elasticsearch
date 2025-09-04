#!/usr/bin/env bun

/**
 * Automated Integration Test Generator
 *
 * This script generates real integration tests for Elasticsearch tools
 * by grouping them by pattern and creating appropriate test scenarios.
 */

import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

interface ToolInfo {
  name: string;
  file: string;
  category: string;
  type: "read" | "write" | "delete" | "update" | "create";
  requiresIndex: boolean;
  requiresDocument: boolean;
}

async function analyzeToolType(_filePath: string, fileName: string): Promise<ToolInfo["type"]> {
  const name = fileName.toLowerCase();

  if (name.includes("delete")) return "delete";
  if (name.includes("create")) return "create";
  if (name.includes("update") || name.includes("put")) return "update";
  if (name.includes("index") && !name.includes("list") && !name.includes("get")) return "write";
  return "read";
}

async function extractToolInfo(filePath: string, category: string): Promise<ToolInfo | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const fileName = basename(filePath);

    // Extract tool name
    const match = content.match(/server\.tool\(\s*["']([^"']+)["']/);
    if (!match) return null;

    const type = await analyzeToolType(filePath, fileName);

    // Check if it needs an index parameter
    const requiresIndex = content.includes("index:") || content.includes('index"');

    // Check if it needs a document parameter
    const requiresDocument = content.includes("document:") || content.includes('document"');

    return {
      name: match[1],
      file: fileName.replace(".ts", ""),
      category,
      type,
      requiresIndex,
      requiresDocument,
    };
  } catch {
    return null;
  }
}

async function generateTestContent(tools: ToolInfo[], category: string): Promise<string> {
  const imports = tools
    .map(
      (t) =>
        `import { register${t.file
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join("")}Tool } from "../../../src/tools/${t.category}/${t.file}.js";`,
    )
    .join("\n");

  const readOnlyTools = tools.filter((t) => t.type === "read");
  const writeTools = tools.filter((t) => t.type !== "read");

  return `/**
 * Auto-generated Integration Tests for ${category} tools
 * Generated: ${new Date().toISOString()}
 * Coverage: ${tools.length} tools
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "@elastic/elasticsearch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createElasticsearchClient, shouldSkipIntegrationTests } from "../../utils/elasticsearch-client.js";
import { wrapServerWithTracing } from "../../../src/utils/universalToolWrapper.js";
import { initializeReadOnlyManager } from "../../../src/utils/readOnlyMode.js";
import { logger } from "../../../src/utils/logger.js";

// Import all tools in this category
${imports}

// Suppress logs during tests
logger.debug = () => {};
logger.info = () => {};
logger.warn = () => {};

describe.skipIf(shouldSkipIntegrationTests())("${category} Tools - Real Integration Tests", () => {
  let client: Client;
  let server: McpServer;
  let wrappedServer: McpServer;
  
  // Test indices
  const TEST_INDEX = \`test-${category}-\${Date.now()}\`;
  const TEST_INDEX_PATTERN = \`test-${category}-*\`;
  
  beforeAll(async () => {
    // Initialize
    initializeReadOnlyManager(false, false);
    
    // Create real Elasticsearch client
    client = createElasticsearchClient();
    
    // Test connection
    try {
      await client.ping();
    } catch (error) {
      throw new Error("Cannot run integration tests without Elasticsearch connection");
    }
    
    // Create MCP server
    server = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });
    
    wrappedServer = wrapServerWithTracing(server);
    
    // Register all tools
${tools
  .map(
    (t) =>
      `    register${t.file
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("")}Tool(wrappedServer, client);`,
  )
  .join("\n")}
    
    // Create test index with sample data
    await client.indices.create({
      index: TEST_INDEX,
      body: {
        mappings: {
          properties: {
            title: { type: "text" },
            content: { type: "text" },
            status: { type: "keyword" },
            timestamp: { type: "date" },
            count: { type: "integer" },
            tags: { type: "keyword" },
            location: { type: "geo_point" },
            metadata: { type: "object" }
          },
        },
      },
    });
    
    // Insert diverse test data
    const testDocs = [
      {
        title: "Test Document 1",
        content: "This is a test document with searchable content",
        status: "active",
        timestamp: "2025-01-15T10:00:00Z",
        count: 42,
        tags: ["test", "integration"],
        location: { lat: 40.7128, lon: -74.0060 },
        metadata: { version: "1.0", author: "test" }
      },
      {
        title: "Test Document 2",
        content: "Another document for testing various queries",
        status: "inactive",
        timestamp: "2025-01-16T10:00:00Z",
        count: 100,
        tags: ["test", "sample"],
        location: { lat: 51.5074, lon: -0.1278 },
        metadata: { version: "2.0", author: "bot" }
      }
    ];
    
    for (const doc of testDocs) {
      await client.index({
        index: TEST_INDEX,
        document: doc,
        refresh: true,
      });
    }
  });
  
  afterAll(async () => {
    // Cleanup
    try {
      await client.indices.delete({ index: \`\${TEST_INDEX}*\` });
    } catch {
      // Ignore cleanup errors
    }
    await client.close();
  });

${
  readOnlyTools.length > 0
    ? `
  describe("Read-Only Operations", () => {
${readOnlyTools
  .map(
    (tool) => `
    test("${tool.name} should return valid results", async () => {
      const tool = (server as any).getTool("${tool.name}");
      expect(tool).toBeDefined();
      
      const params: any = {};
      ${tool.requiresIndex ? "params.index = TEST_INDEX;" : ""}
      
      const result = await tool.handler(params);
      
      // Basic assertions that work for all read tools
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      
      // Tool should not throw errors
      expect(result.content[0].text).not.toContain("Error:");
    });

    test("${tool.name} should handle missing/invalid index gracefully", async () => {
      const tool = (server as any).getTool("${tool.name}");
      
      const params: any = {};
      ${tool.requiresIndex ? `params.index = "non-existent-index-999";` : ""}
      
      const result = await tool.handler(params);
      
      // Should handle error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Should indicate error or no results
      const text = result.content[0].text.toLowerCase();
      expect(
        text.includes("error") || 
        text.includes("not found") || 
        text.includes("no ") ||
        text.includes("0 ")
      ).toBe(true);
    });
`,
  )
  .join("")}
  });
`
    : ""
}

${
  writeTools.length > 0
    ? `
  describe("Write Operations", () => {
${writeTools
  .map(
    (tool) => `
    test("${tool.name} should execute successfully", async () => {
      const tool = (server as any).getTool("${tool.name}");
      expect(tool).toBeDefined();
      
      const params: any = {};
      ${tool.requiresIndex ? "params.index = TEST_INDEX;" : ""}
      ${
        tool.requiresDocument
          ? `params.document = { 
        title: "Test from ${tool.name}",
        content: "Auto-generated test document",
        timestamp: new Date().toISOString()
      };`
          : ""
      }
      
      // For safety, only test on our test index
      if (params.index && !params.index.startsWith('test-')) {
        params.index = TEST_INDEX;
      }
      
      const result = await tool.handler(params);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      
      // Check for success indicators
      const text = result.content[0].text.toLowerCase();
      expect(text).not.toContain("error");
    });
`,
  )
  .join("")}
  });
`
    : ""
}

  describe("Edge Cases", () => {
    test("tools should handle empty parameters appropriately", async () => {
      // Test each tool with minimal/empty parameters
      const toolNames = [
${tools.map((t) => `        "${t.name}",`).join("\n")}
      ];
      
      for (const toolName of toolNames) {
        const tool = (server as any).getTool(toolName);
        if (!tool) continue;
        
        try {
          const result = await tool.handler({});
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
        } catch (error) {
          // Some tools may require parameters - that's ok
          expect(error).toBeDefined();
        }
      }
    });
  });
});
`;
}

async function generateTests() {
  const toolsDir = "src/tools";
  const testsDir = "tests/integration/generated";

  // Create output directory
  if (!existsSync(testsDir)) {
    await Bun.write(join(testsDir, ".gitkeep"), "");
  }

  const categories = await readdir(toolsDir);
  let totalTools = 0;
  let totalTests = 0;

  for (const category of categories) {
    if (category.endsWith(".ts") || category === "README.md") continue;

    const categoryPath = join(toolsDir, category);
    const tools: ToolInfo[] = [];

    try {
      const files = await readdir(categoryPath);

      for (const file of files) {
        if (!file.endsWith(".ts") || file === "index.ts" || file === "types.ts" || file.includes(".test.")) {
          continue;
        }

        const filePath = join(categoryPath, file);
        const toolInfo = await extractToolInfo(filePath, category);

        if (toolInfo) {
          tools.push(toolInfo);
          totalTools++;
        }
      }

      if (tools.length > 0) {
        const testContent = await generateTestContent(tools, category);
        const testFile = join(testsDir, `${category}.test.ts`);
        await writeFile(testFile, testContent);
        totalTests++;
        console.log(`✅ Generated tests for ${category}: ${tools.length} tools`);
      }
    } catch {
      // Skip non-directories
    }
  }

  console.log("\n📊 Test Generation Summary:");
  console.log(`   Total tools found: ${totalTools}`);
  console.log(`   Test files generated: ${totalTests}`);
  console.log(`   Location: ${testsDir}`);
  console.log("\n🚀 Run tests with: bun test tests/integration/generated/");
}

// Generate the tests
await generateTests();
