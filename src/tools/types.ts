import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";

export interface ToolParams {
  index?: string;
  queryBody?: Record<string, any>;
  [key: string]: any;
}

export interface SearchResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

export type ToolFunction = (
  server: McpServer,
  esClient: Client
) => void;

export type ToolHandler = (params: ToolParams) => Promise<SearchResult>; 