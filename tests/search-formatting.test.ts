import { describe, expect, test, beforeEach } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMockClient, createMockServer } from "./utils/test-helpers.js";
import { registerSearchTool } from "../src/tools/core/search.js";

describe("Search Tool Output Formatting", () => {
  let mockServer: McpServer;
  let mockClient: Client;

  beforeEach(() => {
    mockServer = createMockServer();
    mockClient = createMockClient();
    registerSearchTool(mockServer, mockClient);
  });

  test("should format string fields without escape sequences", async () => {
    // Mock the Elasticsearch response with nested JSON data
    mockClient.search = async () => ({
      hits: {
        total: { value: 1, relation: "eq" },
        hits: [
          {
            _id: "test-id-1",
            _score: 1.0,
            _source: {
              hostname: "ip-10-34-51-92.eu-central-1.compute.internal",
              name: "ip-10-34-51-92.eu-central-1.compute.internal",
              architecture: "amd64",
              severity: 9,
              dataset: "apm.app.capella_document_search",
              message: "GET request received for collections",
              user: "unknown",
              process_runtime_description: "Node.js",
              process_command: "/app/build/index.js",
              // Nested object that was causing escape sequences
              agent: {
                name: "otlp",
                version: "unknown"
              },
              process: {
                pid: 1,
                executable: "/usr/local/bin/bun"
              },
              "@timestamp": "2025-08-08T09:09:27.447Z",
              log: {
                level: "info"
              }
            }
          }
        ]
      },
      aggregations: undefined
    });

    mockClient.indices.getMapping = async () => ({});

    const tool = (mockServer as any).getTool("elasticsearch_search");
    const result = await tool.handler({
      index: "logs-*",
      queryBody: {
        query: { match_all: {} },
        size: 10
      }
    });

    // Check that the output doesn't contain escaped quotes
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(1);
    
    const outputText = result.content[1].text;
    
    // Should NOT contain escaped quotes for simple string values
    expect(outputText).toContain('hostname: ip-10-34-51-92.eu-central-1.compute.internal');
    expect(outputText).toContain('name: ip-10-34-51-92.eu-central-1.compute.internal');
    expect(outputText).toContain('architecture: amd64');
    expect(outputText).toContain('message: GET request received for collections');
    
    // Should NOT have escaped quotes like \"hostname\":
    expect(outputText).not.toContain('\\"hostname\\"');
    expect(outputText).not.toContain('\\"name\\"');
    expect(outputText).not.toContain('\\"architecture\\"');
    
    // Nested objects should be pretty-printed
    expect(outputText).toContain('agent: {');
    expect(outputText).toContain('  "name": "otlp"');
    expect(outputText).toContain('  "version": "unknown"');
  });

  test("should handle mixed data types correctly", async () => {
    mockClient.search = async () => ({
      hits: {
        total: { value: 1, relation: "eq" },
        hits: [
          {
            _id: "test-id-2",
            _score: 1.0,
            _source: {
              stringField: "simple string",
              numberField: 42,
              booleanField: true,
              nullField: null,
              arrayField: ["item1", "item2", "item3"],
              objectField: {
                nested: "value",
                count: 100
              },
              emptyObject: {},
              emptyArray: []
            }
          }
        ]
      },
      aggregations: undefined
    });

    mockClient.indices.getMapping = async () => ({});

    const tool = (mockServer as any).getTool("elasticsearch_search");
    const result = await tool.handler({
      index: "test-index",
      queryBody: {
        query: { match_all: {} },
        size: 1
      }
    });

    const outputText = result.content[1].text;
    
    // String fields should not have quotes
    expect(outputText).toContain('stringField: simple string');
    
    // Numbers should be plain
    expect(outputText).toContain('numberField: 42');
    
    // Booleans should be plain
    expect(outputText).toContain('booleanField: true');
    
    // Null should be plain
    expect(outputText).toContain('nullField: null');
    
    // Arrays should be properly formatted
    expect(outputText).toContain('arrayField: [');
    expect(outputText).toContain('"item1"');
    
    // Objects should be pretty-printed
    expect(outputText).toContain('objectField: {');
    expect(outputText).toContain('"nested": "value"');
    expect(outputText).toContain('"count": 100');
    
    // Empty structures
    expect(outputText).toContain('emptyObject: {}');
    expect(outputText).toContain('emptyArray: []');
  });

  test("should handle highlighted fields correctly", async () => {
    mockClient.search = async () => ({
      hits: {
        total: { value: 1, relation: "eq" },
        hits: [
          {
            _id: "test-id-3",
            _score: 1.5,
            _source: {
              title: "Elasticsearch Guide",
              content: "This is a guide about Elasticsearch and searching",
              tags: ["search", "database", "nosql"]
            },
            highlight: {
              title: ["<em>Elasticsearch</em> Guide"],
              content: ["This is a guide about <em>Elasticsearch</em> and <em>searching</em>"]
            }
          }
        ]
      },
      aggregations: undefined
    });

    mockClient.indices.getMapping = async () => ({
      "test-index": {
        mappings: {
          properties: {
            title: { type: "text" },
            content: { type: "text" },
            tags: { type: "keyword" }
          }
        }
      }
    });

    const tool = (mockServer as any).getTool("elasticsearch_search");
    const result = await tool.handler({
      index: "test-index",
      queryBody: {
        query: { 
          match: { 
            content: "elasticsearch" 
          } 
        },
        size: 1
      }
    });

    const outputText = result.content[1].text;
    
    // Highlighted fields should show with the highlight markers
    expect(outputText).toContain('title (highlighted): <em>Elasticsearch</em> Guide');
    expect(outputText).toContain('content (highlighted): This is a guide about <em>Elasticsearch</em> and <em>searching</em>');
    
    // Non-highlighted fields should still appear normally
    expect(outputText).toContain('tags: [');
    expect(outputText).toContain('"search"');
  });
});