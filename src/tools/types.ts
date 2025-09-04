// src/tools/types.ts

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Common Elasticsearch parameter types
export type ExpandWildcards = "open" | "closed" | "hidden" | "none" | "all";
export type WaitForActiveShards = "all" | number;
export type Conflicts = "abort" | "proceed";
export type SearchType = "query_then_fetch" | "dfs_query_then_fetch";

// Common request parameters
export interface CommonRequestParams {
  index?: string | string[];
  waitForActiveShards?: WaitForActiveShards;
  expandWildcards?: ExpandWildcards;
  ignoreUnavailable?: boolean;
  allowNoIndices?: boolean;
}

// Base parameter type for all tools
export interface ToolParams {
  index?: string | string[];
  queryBody?: unknown;
  [key: string]: unknown;
}

// Content types
export interface TextContent {
  type: "text";
  text: string;
  [key: string]: unknown;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface AudioContent {
  type: "audio";
  data: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface ResourceContent {
  type: "resource";
  resource:
    | {
        text: string;
        uri: string;
        mimeType?: string;
        [key: string]: unknown;
      }
    | {
        uri: string;
        blob: string;
        mimeType?: string;
        [key: string]: unknown;
      };
  [key: string]: unknown;
}

// Search result type
export interface SearchResult {
  content: (TextContent | ImageContent | AudioContent | ResourceContent)[];
  _meta?: {
    [key: string]: unknown;
  };
  structuredContent?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Common response types
export interface ElasticsearchResponse {
  _index: string;
  _id: string;
  _version?: number;
  _shards?: {
    total: number;
    successful: number;
    failed: number;
  };
  result?: string;
}

// Error response type
export interface ElasticsearchError {
  error: {
    type: string;
    reason: string;
    status: number;
  };
}

export type ToolFunction = (server: McpServer, esClient: Client) => void;

// Tool handler type
export type ToolHandler = (params: ToolParams, extra: Record<string, unknown>) => Promise<SearchResult>;

// Tool registration function type
export type ToolRegistrationFunction = (server: any, esClient: any) => void;
