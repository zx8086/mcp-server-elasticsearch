#!/usr/bin/env bun

/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client, estypes, ClientOptions, TransportRequestParams, Transport } from "@elastic/elasticsearch";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import http from 'http';
import https from 'https';
import { validateEnvironment, validateConfig, checkElasticsearchConnection, testBasicOperations } from './validation.js';
import { request } from 'undici';

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

    logger.info("All tools registered successfully");
    return server;
  } catch (error: unknown) {
    logger.error("Error creating server:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

if (import.meta.main) {
  logger.info("Starting application");
  
  const config: ElasticsearchConfig = {
    url: process.env.ES_URL || "",
    apiKey: process.env.ES_API_KEY || "",
    username: process.env.ES_USERNAME || "",
    password: process.env.ES_PASSWORD || "",
    caCert: process.env.ES_CA_CERT || "",
  };

  logger.debug("Environment variables loaded:", {
    hasUrl: !!config.url,
    hasApiKey: !!config.apiKey,
    hasUsername: !!config.username,
    hasPassword: !!config.password,
    hasCaCert: !!config.caCert
  });

  try {
    logger.info("Creating StdioServerTransport");
    const transport = new StdioServerTransport();
    
    logger.info("Creating Elasticsearch MCP Server");
    const server = await createElasticsearchMcpServer(config);
    
    logger.info("Connecting server to transport");
    await server.connect(transport);
    logger.info("Server connected successfully");

    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down...");
      await server.close();
      logger.info("Server closed successfully");
      process.exit(0);
    });

    logger.info("Server startup complete");
  } catch (error: unknown) {
    logger.error(
      "Server startup failed:",
      error instanceof Error ? error.message : String(error)
    );
    if (error instanceof Error && error.stack) {
      logger.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}
