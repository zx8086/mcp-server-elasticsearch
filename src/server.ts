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
import { HttpConnection } from "@elastic/transport";
import { readFileSync } from "fs";
import { validateEnvironment, validateConfig, checkElasticsearchConnection, testBasicOperations, testModernFeatures } from './validation.js';
import { logger } from './utils/logger.js';
import { registerAllTools } from "./tools/index.js";

// Define the types we need using estypes
type Refresh = estypes.Refresh;
type SqlQuerySqlFormat = estypes.SqlQuerySqlFormat;
type Level = estypes.Level;
type HealthStatus = estypes.HealthStatus;

type ExpandWildcards = 'all' | 'open' | 'closed' | 'hidden' | 'none';
type VersionType = 'internal' | 'external' | 'external_gte' | 'force';
type SearchType = 'query_then_fetch' | 'dfs_query_then_fetch';

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

    logger.info("Creating Elasticsearch client with URL:", { url });
    
    // FIXED: Use HttpConnection instead of UndiciConnection to resolve the undici issues
    const clientOptions: ClientOptions = {
      node: url,
      auth: apiKey ? { apiKey } : username && password ? { username, password } : undefined,
      
      // CRITICAL FIX: Use HttpConnection instead of default UndiciConnection
      Connection: HttpConnection,
      
      // Modern client configuration
      compression: true,
      maxRetries: 3,
      requestTimeout: 30000,
      
      // Client identification and observability
      name: 'elasticsearch-mcp-server',
      opaqueIdPrefix: 'mcp-server::',
      
      // Updated headers for better compatibility
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate'
      },
      
      // Updated context with proper user agent
      context: {
        userAgent: 'elasticsearch-mcp-server/0.1.1 (bun)'
      },
      
      // Enhanced error handling and redaction
      redaction: {
        type: 'replace',
        additionalKeys: ['authorization', 'x-elastic-client-meta']
      },
      
      // Enable meta header for telemetry (can be disabled if needed)
      enableMetaHeader: true,
      
      // Disable prototype poisoning protection for performance (already default)
      disablePrototypePoisoningProtection: true,
      
      // Add TLS configuration if CA cert is provided
      ...(caCert && {
        tls: {
          ca: readFileSync(caCert),
          rejectUnauthorized: true
        }
      })
    };

    logger.debug("Initializing Elasticsearch client with HttpConnection:", { 
      ...clientOptions, 
      auth: clientOptions.auth ? '[REDACTED]' : undefined,
      tls: clientOptions.tls ? '[TLS_CONFIG_PRESENT]' : undefined,
      Connection: 'HttpConnection'
    });
    
    const esClient = new Client(clientOptions);
    logger.info("Elasticsearch client created");

    // Enhanced connection test with better error handling
    try {
      logger.debug("Testing connection to Elasticsearch...");
      
      // Use the client's info method for initial connection test
      const info = await esClient.info();
      
      logger.info("Successfully connected to Elasticsearch", {
        version: info.version?.number,
        clusterName: info.cluster_name,
        clusterUuid: info.cluster_uuid
      });
      
      // Store version info for later use
      const serverVersion = info.version?.number;
      const majorVersion = serverVersion ? parseInt(serverVersion.split('.')[0]) : 0;
      
      if (majorVersion >= 9) {
        logger.info(`Connected to Elasticsearch ${serverVersion} - using modern client features`);
      }
      
    } catch (error: unknown) {
      logger.error("Failed to connect to Elasticsearch:", { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }

    // Test basic operations with improved error handling
    try {
      const operationsCheck = await testBasicOperations(esClient);
      if (!operationsCheck.valid) {
        logger.warn("Some basic operations failed:", { 
          errors: operationsCheck.errors,
          warnings: operationsCheck.warnings || []
        });
      } else {
        logger.info("All basic operations successful");
      }
    } catch (error) {
      logger.warn("Basic operations test failed, but continuing:", { 
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Test modern features
    try {
      const modernFeaturesCheck = await testModernFeatures(esClient);
      const warnings = modernFeaturesCheck.warnings || [];
      if (warnings.length > 0) {
        logger.info("Modern features check:", { warnings });
      }
    } catch (error) {
      logger.warn("Modern features test failed, but continuing:", { 
        error: error instanceof Error ? error.message : String(error)
      });
    }

    logger.info("Creating MCP Server instance");
    const server = new McpServer({
      name: "elasticsearch-mcp-server",
      version: "0.1.1",
    });
    logger.debug("MCP Server instance created");

    // Register all tools (modularized)
    registerAllTools(server, esClient);

    logger.info("All tools registered successfully");
    return server;
  } catch (error: unknown) {
    logger.error("Error creating server:", { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
} 