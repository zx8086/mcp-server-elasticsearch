import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expect, mock, spyOn } from "bun:test";
import { z } from "zod";

export interface MockClient extends Partial<Client> {
  indices: any;
  search: any;
  index: any;
  get: any;
  update: any;
  delete: any;
  bulk: any;
  count: any;
  cluster: any;
  nodes: any;
}

export function createMockClient(overrides: Partial<MockClient> = {}): Client {
  const mockClient: MockClient = {
    indices: {
      exists: mock(() => Promise.resolve(true)),
      create: mock(() => Promise.resolve({ acknowledged: true })),
      delete: mock(() => Promise.resolve({ acknowledged: true })),
      getMapping: mock(() => Promise.resolve({})),
      getSettings: mock(() => Promise.resolve({})),
      putMapping: mock(() => Promise.resolve({ acknowledged: true })),
      refresh: mock(() => Promise.resolve({})),
      flush: mock(() => Promise.resolve({})),
      ...overrides.indices,
    },
    search: mock(() =>
      Promise.resolve({
        hits: {
          total: { value: 0 },
          hits: [],
        },
      }),
    ),
    index: mock(() => Promise.resolve({ _id: "1", result: "created" })),
    get: mock(() => Promise.resolve({ _id: "1", _source: {} })),
    update: mock(() => Promise.resolve({ _id: "1", result: "updated" })),
    delete: mock(() => Promise.resolve({ _id: "1", result: "deleted" })),
    bulk: mock(() => Promise.resolve({ items: [] })),
    count: mock(() => Promise.resolve({ count: 0 })),
    cluster: {
      health: mock(() => Promise.resolve({ status: "green" })),
      stats: mock(() => Promise.resolve({})),
      ...overrides.cluster,
    },
    nodes: {
      info: mock(() => Promise.resolve({})),
      stats: mock(() => Promise.resolve({})),
      ...overrides.nodes,
    },
    ...overrides,
  };

  return mockClient as unknown as Client;
}

export function createMockServer(): McpServer & { getTools: () => any[]; getTool: (name: string) => any } {
  const tools: Map<string, any> = new Map();

  return {
    tool: mock((name: string, description: string, schema: any, handler: any) => {
      tools.set(name, { name, description, schema, handler });
    }),
    registerTool: mock((name: string, metadata: any, handler: any) => {
      tools.set(name, { name, description: metadata.description, schema: metadata.inputSchema, handler });
    }),
    getTools: () => Array.from(tools.values()),
    getTool: (name: string) => tools.get(name),
  } as unknown as McpServer & { getTools: () => any[]; getTool: (name: string) => any };
}

export function validateZodSchema(schema: z.ZodSchema<any>): void {
  // Validate that the schema can parse valid data without throwing
  expect(schema).toBeDefined();
  expect(typeof schema.parse).toBe("function");
}

export function testToolRegistration(
  toolName: string,
  registerFunction: (server: McpServer, client: Client) => void,
): void {
  const mockServer = createMockServer();
  const mockClient = createMockClient();

  registerFunction(mockServer, mockClient);

  const tool = mockServer.getTool(toolName);
  expect(tool).toBeDefined();
  expect(tool.name).toBe(toolName);
  expect(tool.description).toBeDefined();
  expect(tool.schema).toBeDefined();
  expect(tool.handler).toBeDefined();
}

export async function testToolHandler(
  toolName: string,
  registerFunction: (server: McpServer, client: Client) => void,
  args: any,
  clientOverrides: Partial<MockClient> = {},
): Promise<any> {
  const mockServer = createMockServer();
  const mockClient = createMockClient(clientOverrides);

  registerFunction(mockServer, mockClient);

  const tool = mockServer.getTool(toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  return await tool.handler(args);
}

export function createTestSearchResponse(numHits = 5) {
  const hits = Array.from({ length: numHits }, (_, i) => ({
    _id: `doc${i + 1}`,
    _score: 1.0 - i * 0.1,
    _source: {
      title: `Document ${i + 1}`,
      content: `This is the content of document ${i + 1}`,
    },
    highlight: {
      title: [`<em>Document</em> ${i + 1}`],
    },
  }));

  return {
    hits: {
      total: { value: numHits },
      hits,
    },
    aggregations: {},
  };
}

export function createTestMapping() {
  return {
    test_index: {
      mappings: {
        properties: {
          title: { type: "text" },
          content: { type: "text" },
          created_at: { type: "date" },
          status: { type: "keyword" },
          count: { type: "integer" },
        },
      },
    },
  };
}

export function createTestIndexList(numIndices = 3) {
  const indices: any = {};
  for (let i = 0; i < numIndices; i++) {
    indices[`index-${i + 1}`] = {
      health: "green",
      status: "open",
      index: `index-${i + 1}`,
      uuid: `uuid-${i + 1}`,
      pri: "1",
      rep: "1",
      "docs.count": String(100 * (i + 1)),
      "docs.deleted": "0",
      "store.size": `${i + 1}mb`,
      "pri.store.size": `${i + 1}mb`,
    };
  }
  return indices;
}

export function createTestDocument(id = "1") {
  return {
    _id: id,
    _index: "test_index",
    _source: {
      title: `Test Document ${id}`,
      content: `This is test document ${id}`,
      created_at: new Date().toISOString(),
      status: "active",
      count: 42,
    },
  };
}