#!/usr/bin/env bun

/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  Client, 
  estypes, 
  ClientOptions, 
  TransportRequestParams, 
  Transport
} from "@elastic/elasticsearch";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import http from 'http';
import https from 'https';
import { validateEnvironment, validateConfig, checkElasticsearchConnection, testBasicOperations } from './validation.js';
import { request } from 'undici';

// Define the types we need using estypes
type Refresh = estypes.Refresh;
type SqlQuerySqlFormat = estypes.SqlQuerySqlFormat;
type Level = estypes.Level;
type HealthStatus = estypes.HealthStatus;

type ExpandWildcards = 'all' | 'open' | 'closed' | 'hidden' | 'none';
type VersionType = 'internal' | 'external' | 'external_gte' | 'force';
type SearchType = 'query_then_fetch' | 'dfs_query_then_fetch';

// Configure detailed logging
const logger = {
  info: (message: string, ...args: any[]) => {
    const safeArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, (key, value) => {
            if (key === 'auth' || key === 'password' || key === 'apiKey') return '[REDACTED]';
            return value;
          });
        } catch (e) {
          return '[Object]';
        }
      }
      return arg;
    });
    // Write all logs to stderr
    console.error(`[${new Date().toISOString()}] [INFO] ${message}`, ...safeArgs);
  },
  error: (message: string, ...args: any[]) => {
    const safeArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, (key, value) => {
            if (key === 'auth' || key === 'password' || key === 'apiKey') return '[REDACTED]';
            return value;
          });
        } catch (e) {
          return '[Object]';
        }
      }
      return arg;
    });
    console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, ...safeArgs);
  },
  debug: (message: string, ...args: any[]) => {
    const safeArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, (key, value) => {
            if (key === 'auth' || key === 'password' || key === 'apiKey') return '[REDACTED]';
            return value;
          });
        } catch (e) {
          return '[Object]';
        }
      }
      return arg;
    });
    console.error(`[${new Date().toISOString()}] [DEBUG] ${message}`, ...safeArgs);
  },
  warn: (message: string, ...args: any[]) => {
    const safeArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, (key, value) => {
            if (key === 'auth' || key === 'password' || key === 'apiKey') return '[REDACTED]';
            return value;
          });
        } catch (e) {
          return '[Object]';
        }
      }
      return arg;
    });
    console.error(`[${new Date().toISOString()}] [WARN] ${message}`, ...safeArgs);
  }
};

// Configuration schema with auth options
const ConfigSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, "Elasticsearch URL cannot be empty")
      .url("Invalid Elasticsearch URL format")
      .describe("Elasticsearch server URL"),

    apiKey: z
      .string()
      .optional()
      .describe("API key for Elasticsearch authentication"),

    username: z
      .string()
      .optional()
      .describe("Username for Elasticsearch authentication"),

    password: z
      .string()
      .optional()
      .describe("Password for Elasticsearch authentication"),

    caCert: z
      .string()
      .optional()
      .describe("Path to custom CA certificate for Elasticsearch"),
  })
  .refine(
    (data) => {
      // If username is provided, password must be provided
      if (data.username) {
        return !!data.password;
      }

      // If password is provided, username must be provided
      if (data.password) {
        return !!data.username;
      }

      // If apiKey is provided, it's valid
      if (data.apiKey) {
        return true;
      }

      // No auth is also valid (for local development)
      return true;
    },
    {
      message:
        "Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided, or no auth for local development",
      path: ["username", "password"],
    }
  );

type ElasticsearchConfig = z.infer<typeof ConfigSchema>;

export async function createElasticsearchMcpServer(
  config: ElasticsearchConfig
): Promise<McpServer> {
  logger.info("Starting server creation with config:", { 
    url: config.url,
    hasApiKey: !!config.apiKey,
    hasUsername: !!config.username,
    hasPassword: !!config.password,
    hasCaCert: !!config.caCert
  });

  try {
    // Validate environment variables
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
    }

    // Validate config
    const configValidation = validateConfig(config);
    if (!configValidation.valid) {
      throw new Error(`Config validation failed: ${configValidation.errors.join(', ')}`);
    }

    const validatedConfig = ConfigSchema.parse(config);
    logger.debug("Config validation passed");
    
    const { url, apiKey, username, password, caCert } = validatedConfig;

    logger.info("Creating Elasticsearch client with URL:", url);
    const clientOptions: ClientOptions = {
      node: url,
      auth: apiKey ? { apiKey } : username && password ? { username, password } : undefined,
      compression: true,
      maxRetries: 3,
      requestTimeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      context: {
        userAgent: 'elasticsearch-js/8.10.0 (bun 1.2.14)'
      }
    };

    logger.debug("Initializing Elasticsearch client with options:", { 
      ...clientOptions, 
      auth: clientOptions.auth ? '[REDACTED]' : undefined
    });
    
    const esClient = new Client(clientOptions);
    logger.info("Elasticsearch client created");

    // Test connection using Node's native HTTP client
    try {
      logger.debug("Testing connection to Elasticsearch...");
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const response = await new Promise<{ version?: { number: string }, cluster_name: string }>((resolve, reject) => {
        const req = client.request({
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: '/',
          method: 'GET',
          headers: {
            'Authorization': apiKey ? `ApiKey ${apiKey}` : undefined,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        });
        
        req.on('error', reject);
        req.end();
      });

      logger.info("Successfully connected to Elasticsearch", {
        version: response.version?.number,
        clusterName: response.cluster_name
      });
    } catch (error: unknown) {
      logger.error("Failed to connect to Elasticsearch:", error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        logger.error("Connection error stack trace:", error.stack);
      }
      throw error;
    }

    // Test basic operations
    const operationsCheck = await testBasicOperations(esClient);
    if (!operationsCheck.valid) {
      logger.warn("Basic operations check failed:", operationsCheck.errors.join(', '));
      const warnings = operationsCheck.warnings || [];
      if (warnings.length > 0) {
        logger.warn("Warnings:", warnings.join(', '));
      }
    }

    logger.info("Creating MCP Server instance");
    const server = new McpServer({
      name: "elasticsearch-mcp-server",
      version: "0.1.1",
    });
    logger.debug("MCP Server instance created");

    // Tool 1: List indices
    logger.debug("Registering list_indices tool");
    server.tool(
      "list_indices",
      "List all available Elasticsearch indices",
      {
        indexPattern: z
          .string()
          .trim()
          .min(1, "Index pattern is required")
          .describe("Index pattern of Elasticsearch indices to list"),
      },
      async ({ indexPattern }) => {
        logger.debug(`Listing indices with pattern: ${indexPattern}`);
        try {
          const response = await request(`${url}/_cat/indices/${indexPattern}?format=json&h=index,health,status,docs.count`, {
            method: 'GET',
            headers: {
              'Authorization': apiKey ? `ApiKey ${apiKey}` : undefined,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });

          const data = await response.body.json();
          
          logger.debug(`Response from Elasticsearch: ${JSON.stringify(data)}`);

          if (!Array.isArray(data)) {
            throw new Error("Invalid response format from Elasticsearch");
          }

          logger.debug(`Found ${data.length} indices`);

          const indicesInfo = data.map((index) => ({
            index: index.index,
            health: index.health,
            status: index.status,
            docsCount: index["docs.count"],
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: `Found ${indicesInfo.length} indices`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(indicesInfo, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          logger.error(
            "Failed to list indices:",
            error instanceof Error ? error.message : String(error)
          );
          if (error instanceof Error && error.stack) {
            logger.error("Stack trace:", error.stack);
          }
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );

    // Tool 2: Get mappings for an index
    server.tool(
      "get_mappings",
      "Get field mappings for a specific Elasticsearch index",
      {
        index: z
          .string()
          .trim()
          .min(1, "Index name is required")
          .describe("Name of the Elasticsearch index to get mappings for"),
      },
      async ({ index }) => {
        try {
          logger.debug(`Getting mappings for index: ${index}`);
          const response = await request(`${url}/${index}/_mapping`, {
            method: 'GET',
            headers: {
              'Authorization': apiKey ? `ApiKey ${apiKey}` : undefined,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });

          const data = await response.body.json() as Record<string, { mappings: any }>;
          
          logger.debug(`Response from Elasticsearch: ${JSON.stringify(data)}`);

          return {
            content: [
              {
                type: "text" as const,
                text: `Mappings for index: ${index}`,
              },
              {
                type: "text" as const,
                text: JSON.stringify(data[index]?.mappings || {}, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          logger.error(
            "Failed to get mappings:",
            error instanceof Error ? error.message : String(error)
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );

    // Tool 3: Search an index with simplified parameters
    server.tool(
      "search",
      "Perform an Elasticsearch search with the provided query DSL. Highlights are always enabled.",
      {
        index: z
          .string()
          .trim()
          .min(1, "Index name is required")
          .describe("Name of the Elasticsearch index to search"),

        queryBody: z
          .record(z.any())
          .refine(
            (val) => {
              try {
                JSON.parse(JSON.stringify(val));
                return true;
              } catch (e) {
                return false;
              }
            },
            {
              message: "queryBody must be a valid Elasticsearch query DSL object",
            }
          )
          .describe(
            "Complete Elasticsearch query DSL object that can include query, size, from, sort, etc."
          ),
      },
      async ({ index, queryBody }) => {
        try {
          logger.debug(`Searching index: ${index} with query: ${JSON.stringify(queryBody)}`);
          
          // Get mappings to identify text fields for highlighting
          const mappingResponse = await request(`${url}/${index}/_mapping`, {
            method: 'GET',
            headers: {
              'Authorization': apiKey ? `ApiKey ${apiKey}` : undefined,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });

          const mappingData = await mappingResponse.body.json() as Record<string, { mappings: any }>;
          const indexMappings = mappingData[index]?.mappings || {};

          const searchRequest = {
            ...queryBody,
          };

          // Always do highlighting
          if (indexMappings.properties) {
            const textFields: Record<string, any> = {};

            for (const [fieldName, fieldData] of Object.entries(
              indexMappings.properties
            )) {
              if ((fieldData as any).type === "text" || "dense_vector" in (fieldData as any)) {
                textFields[fieldName] = {};
              }
            }

            searchRequest.highlight = {
              fields: textFields,
              pre_tags: ["<em>"],
              post_tags: ["</em>"],
            };
          }

          const response = await request(`${url}/${index}/_search`, {
            method: 'POST',
            headers: {
              'Authorization': apiKey ? `ApiKey ${apiKey}` : undefined,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(searchRequest)
          });

          const result = await response.body.json() as any;

          // Extract the 'from' parameter from queryBody, defaulting to 0 if not provided
          const from = queryBody.from || 0;

          // Handle aggregation results
          if (queryBody.size === 0 || queryBody.aggs) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Search results with aggregations:`,
                },
                {
                  type: "text" as const,
                  text: JSON.stringify(result.aggregations || {}, null, 2),
                },
              ],
            };
          }

          const contentFragments = result.hits.hits.map((hit: any) => {
            const highlightedFields = hit.highlight || {};
            const sourceData = hit._source || {};

            let content = "";

            for (const [field, highlights] of Object.entries(highlightedFields)) {
              if (highlights && Array.isArray(highlights) && highlights.length > 0) {
                content += `${field} (highlighted): ${highlights.join(
                  " ... "
                )}\n`;
              }
            }

            for (const [field, value] of Object.entries(sourceData)) {
              if (!(field in highlightedFields)) {
                content += `${field}: ${JSON.stringify(value)}\n`;
              }
            }

            return {
              type: "text" as const,
              text: content.trim(),
            };
          });

          const metadataFragment = {
            type: "text" as const,
            text: `Total results: ${
              typeof result.hits.total === "number"
                ? result.hits.total
                : result.hits.total?.value || 0
            }, showing ${result.hits.hits.length} from position ${from}`,
          };

          return {
            content: [metadataFragment, ...contentFragments],
          };
        } catch (error: unknown) {
          logger.error(
            "Search failed:",
            error instanceof Error ? error.message : String(error)
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );

    // Tool 4: Get shard information
    server.tool(
      "get_shards",
      "Get shard information for all or specific indices",
      {
        index: z
          .string()
          .optional()
          .describe("Optional index name to get shard information for"),
      },
      async ({ index }) => {
        try {
          logger.debug(`Getting shard information${index ? ` for index: ${index}` : ''}`);
          const response = await request(`${url}/_cat/shards${index ? `/${index}` : ''}?format=json`, {
            method: 'GET',
            headers: {
              'Authorization': apiKey ? `ApiKey ${apiKey}` : undefined,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });

          const data = await response.body.json() as Array<{
            index: string;
            shard: string;
            prirep: string;
            state: string;
            docs: string;
            store: string;
            ip: string;
            node: string;
          }>;
          
          logger.debug(`Response from Elasticsearch: ${JSON.stringify(data)}`);

          const shardsInfo = data.map((shard) => ({
            index: shard.index,
            shard: shard.shard,
            prirep: shard.prirep,
            state: shard.state,
            docs: shard.docs,
            store: shard.store,
            ip: shard.ip,
            node: shard.node,
          }));

          const metadataFragment = {
            type: "text" as const,
            text: `Found ${shardsInfo.length} shards${
              index ? ` for index ${index}` : ""
            }`,
          };

          return {
            content: [
              metadataFragment,
              {
                type: "text" as const,
                text: JSON.stringify(shardsInfo, null, 2),
              },
            ],
          };
        } catch (error: unknown) {
          logger.error(
            "Failed to get shard information:",
            error instanceof Error ? error.message : String(error)
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
          };
        }
      }
    );

    // Enhanced Elasticsearch operations
    class ElasticsearchOperations {
      private client: Client;

      constructor(client: Client) {
        this.client = client;
      }

      // Document Operations
      async indexDocument(params: any) {
        try {
          const result = await this.client.index({
            index: params.index,
            id: params.id,
            document: params.document,
            refresh: params.refresh,
            routing: params.routing,
            pipeline: params.pipeline,
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async getDocument(params: any) {
        try {
          const result = await this.client.get({
            index: params.index,
            id: params.id,
            _source: params.source,
            _source_excludes: params.sourceExcludes,
            _source_includes: params.sourceIncludes,
            routing: params.routing,
            preference: params.preference,
            realtime: params.realtime,
            refresh: params.refresh,
            version: params.version,
            version_type: params.versionType,
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async updateDocument(params: any) {
        try {
          const result = await this.client.update({
            index: params.index,
            id: params.id,
            doc: params.doc,
            script: params.script,
            upsert: params.upsert,
            doc_as_upsert: params.docAsUpsert,
            detect_noop: params.detectNoop,
            scripted_upsert: params.scriptedUpsert,
            refresh: params.refresh,
            routing: params.routing,
            timeout: params.timeout,
            wait_for_active_shards: params.waitForActiveShards,
            if_seq_no: params.ifSeqNo,
            if_primary_term: params.ifPrimaryTerm,
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async deleteDocument(params: any) {
        try {
          const result = await this.client.delete({
            index: params.index,
            id: params.id,
            routing: params.routing,
            refresh: params.refresh,
            version: params.version,
            version_type: params.versionType,
            if_seq_no: params.ifSeqNo,
            if_primary_term: params.ifPrimaryTerm,
            timeout: params.timeout,
            wait_for_active_shards: params.waitForActiveShards,
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async documentExists(params: any) {
        try {
          const result = await this.client.exists({
            index: params.index,
            id: params.id,
            routing: params.routing,
            preference: params.preference,
            realtime: params.realtime,
            refresh: params.refresh,
            version: params.version,
            version_type: params.versionType,
          });
          return { success: true, exists: result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      // Bulk Operations
      async bulkOperations(params: any) {
        try {
          const result = await this.client.bulk({
            operations: params.operations,
            index: params.index,
            routing: params.routing,
            pipeline: params.pipeline,
            refresh: params.refresh,
            require_alias: params.requireAlias,
            timeout: params.timeout,
            wait_for_active_shards: params.waitForActiveShards,
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async multiGet(params: any) {
        try {
          const result = await this.client.mget({
            docs: params.docs,
            index: params.index,
            preference: params.preference,
            realtime: params.realtime,
            refresh: params.refresh,
            routing: params.routing,
            _source: params.source,
            _source_excludes: params.sourceExcludes,
            _source_includes: params.sourceIncludes,
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      // SQL Operations
      async executeSqlQuery(params: any) {
        try {
          const result = await this.client.sql.query({
            query: params.query,
            format: params.format,
            fetch_size: params.fetchSize
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async updateByQuery(params: any) {
        try {
          const result = await this.client.updateByQuery({
            index: params.index,
            query: params.query,
            script: params.script,
            max_docs: params.maxDocs,
            conflicts: params.conflicts,
            refresh: params.refresh,
            timeout: params.timeout,
            wait_for_active_shards: params.waitForActiveShards,
            wait_for_completion: params.waitForCompletion,
            requests_per_second: params.requestsPerSecond,
            scroll: params.scroll,
            scroll_size: params.scrollSize,
            search_type: params.searchType,
            search_timeout: params.searchTimeout,
            slices: params.slices,
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async getClusterHealth(params: any = {}) {
        try {
          const result = await this.client.cluster.health({
            index: params.index,
            expand_wildcards: params.expandWildcards,
            level: params.level,
            local: params.local,
            master_timeout: params.masterTimeout,
            timeout: params.timeout,
            wait_for_active_shards: params.waitForActiveShards,
            wait_for_events: params.waitForEvents,
            wait_for_no_initializing_shards: params.waitForNoInitializingShards,
            wait_for_no_relocating_shards: params.waitForNoRelocatingShards,
            wait_for_nodes: params.waitForNodes,
            wait_for_status: params.waitForStatus,
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      // Add new methods for missing required tools
      async countDocuments(params: any) {
        try {
          const result = await this.client.count({
            index: params.index,
            query: params.query,
            analyzer: params.analyzer,
            analyze_wildcard: params.analyzeWildcard,
            default_operator: params.defaultOperator,
            df: params.df,
            expand_wildcards: params.expandWildcards,
            ignore_throttled: params.ignoreThrottled,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            min_score: params.minScore,
            preference: params.preference,
            routing: params.routing,
            q: params.q,
            terminate_after: params.terminateAfter
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async createIndex(params: any) {
        try {
          const result = await this.client.indices.create({
            index: params.index,
            aliases: params.aliases,
            mappings: params.mappings,
            settings: params.settings,
            timeout: params.timeout,
            master_timeout: params.masterTimeout,
            wait_for_active_shards: params.waitForActiveShards
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async deleteIndex(params: any) {
        try {
          const result = await this.client.indices.delete({
            index: params.index,
            timeout: params.timeout,
            master_timeout: params.masterTimeout,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async indexExists(params: any) {
        try {
          const result = await this.client.indices.exists({
            index: params.index,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards,
            flat_settings: params.flatSettings,
            include_defaults: params.includeDefaults,
            local: params.local
          });
          return { success: true, exists: result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      // Add bonus powerful tools
      async multiSearch(params: any) {
        try {
          const result = await this.client.msearch({
            searches: params.searches,
            index: params.index,
            max_concurrent_searches: params.maxConcurrentSearches,
            ccs_minimize_roundtrips: params.ccsMinimizeRoundtrips,
            rest_total_hits_as_int: params.restTotalHitsAsInt,
            typed_keys: params.typedKeys
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async scrollSearch(params: any) {
        try {
          const result = await this.client.scroll({
            scroll_id: params.scrollId,
            scroll: params.scroll,
            rest_total_hits_as_int: params.restTotalHitsAsInt
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async clearScroll(params: any) {
        try {
          const result = await this.client.clearScroll({
            scroll_id: params.scrollId
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async deleteByQuery(params: any) {
        try {
          const result = await this.client.deleteByQuery({
            index: params.index,
            query: params.query,
            max_docs: params.maxDocs,
            conflicts: params.conflicts,
            refresh: params.refresh,
            timeout: params.timeout,
            wait_for_active_shards: params.waitForActiveShards,
            wait_for_completion: params.waitForCompletion,
            requests_per_second: params.requestsPerSecond,
            scroll: params.scroll,
            scroll_size: params.scrollSize,
            search_type: params.searchType,
            search_timeout: params.searchTimeout,
            slices: params.slices
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async reindexDocuments(params: any) {
        try {
          const result = await this.client.reindex({
            source: params.source,
            dest: params.dest,
            script: params.script,
            conflicts: params.conflicts,
            max_docs: params.maxDocs,
            refresh: params.refresh,
            timeout: params.timeout,
            wait_for_active_shards: params.waitForActiveShards,
            wait_for_completion: params.waitForCompletion,
            requests_per_second: params.requestsPerSecond,
            scroll: params.scroll,
            slices: params.slices
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async getIndex(params: any) {
        try {
          const result = await this.client.indices.get({
            index: params.index,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards,
            flat_settings: params.flatSettings,
            include_defaults: params.includeDefaults,
            local: params.local,
            master_timeout: params.masterTimeout
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async updateIndexSettings(params: any) {
        try {
          const result = await this.client.indices.putSettings({
            index: params.index,
            settings: params.settings,
            preserve_existing: params.preserveExisting,
            timeout: params.timeout,
            master_timeout: params.masterTimeout,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards,
            flat_settings: params.flatSettings
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async getIndexSettings(params: any) {
        try {
          const result = await this.client.indices.getSettings({
            index: params.index,
            name: params.name,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards,
            flat_settings: params.flatSettings,
            include_defaults: params.includeDefaults,
            local: params.local,
            master_timeout: params.masterTimeout
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async refreshIndex(params: any) {
        try {
          const result = await this.client.indices.refresh({
            index: params.index,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async flushIndex(params: any) {
        try {
          const result = await this.client.indices.flush({
            index: params.index,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards,
            force: params.force,
            wait_if_ongoing: params.waitIfOngoing
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async putMapping(params: any) {
        try {
          const result = await this.client.indices.putMapping({
            index: params.index,
            properties: params.properties,
            runtime: params.runtime,
            _meta: params.meta,
            dynamic: params.dynamic,
            date_detection: params.dateDetection,
            dynamic_date_formats: params.dynamicDateFormats,
            dynamic_templates: params.dynamicTemplates,
            numeric_detection: params.numericDetection,
            timeout: params.timeout,
            master_timeout: params.masterTimeout,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards,
            write_index_only: params.writeIndexOnly
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async clearSqlCursor(params: any) {
        try {
          const result = await this.client.sql.clearCursor({
            cursor: params.cursor
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async translateSqlQuery(params: any) {
        try {
          const result = await this.client.sql.translate({
            query: params.query,
            fetch_size: params.fetchSize,
            time_zone: params.timeZone
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async getClusterStats(params: any) {
        try {
          const result = await this.client.cluster.stats({
            node_id: params.nodeId,
            timeout: params.timeout
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async getNodesInfo(params: any) {
        try {
          const result = await this.client.nodes.info({
            node_id: params.nodeId,
            metric: params.metric,
            flat_settings: params.flatSettings,
            timeout: params.timeout
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      async getNodesStats(params: any) {
        try {
          const result = await this.client.nodes.stats({
            node_id: params.nodeId,
            metric: params.metric,
            index_metric: params.indexMetric,
            timeout: params.timeout
          });
          return { success: true, result };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }

      // Search Template Operations
      async searchTemplate(params: {
        index?: string | string[];
        id?: string;
        source?: string;
        params?: Record<string, any>;
        explain?: boolean;
        profile?: boolean;
        allow_no_indices?: boolean;
        expand_wildcards?: ExpandWildcards;
        ignore_unavailable?: boolean;
        ignore_throttled?: boolean;
        preference?: string;
        routing?: string;
        scroll?: string;
        search_type?: SearchType;
        typed_keys?: boolean;
      }) {
        return this.client.searchTemplate(params);
      }

      // Add get_aliases tool
      async getAliases(params: any) {
        try {
          const result = await this.client.indices.getAlias({
            index: params.index,
            name: params.name,
            ignore_unavailable: params.ignoreUnavailable,
            allow_no_indices: params.allowNoIndices,
            expand_wildcards: params.expandWildcards
          });
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    }

    const operations = new ElasticsearchOperations(esClient);

    logger.info("All tools registered successfully");
    return server;
  } catch (error: unknown) {
    logger.error("Error creating server:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
