#!/usr/bin/env bun

/* src/server.ts */

import { readFileSync } from "node:fs";
import { Client } from "@elastic/elasticsearch";
import { HttpConnection } from "@elastic/transport";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { registerAllTools } from "./tools/index.js";
import { logger } from "./utils/logger.js";
import { initializeReadOnlyManager } from "./utils/readOnlyMode.js";

export async function createElasticsearchMcpServer(config: Config): Promise<McpServer> {
  logger.info("Creating Elasticsearch MCP server", {
    url: config.elasticsearch.url,
    hasApiKey: !!config.elasticsearch.apiKey,
    hasUsername: !!config.elasticsearch.username,
    hasPassword: !!config.elasticsearch.password,
    hasCaCert: !!config.elasticsearch.caCert,
    readOnlyMode: config.server.readOnlyMode,
    readOnlyStrictMode: config.server.readOnlyStrictMode,
    tracingEnabled: config.langsmith.tracing,
  });

  try {
    // Initialize read-only mode manager with config values
    initializeReadOnlyManager(config.server.readOnlyMode, config.server.readOnlyStrictMode);

    if (config.server.readOnlyMode) {
      logger.info("READ-ONLY MODE ACTIVE", {
        strictMode: config.server.readOnlyStrictMode,
        behavior: config.server.readOnlyStrictMode
          ? "Destructive operations will be BLOCKED"
          : "Destructive operations will show WARNINGS",
      });
    }

    // Build Elasticsearch client configuration
    const clientOptions: ConstructorParameters<typeof Client>[0] = {
      node: config.elasticsearch.url,
      auth: config.elasticsearch.apiKey
        ? { apiKey: config.elasticsearch.apiKey }
        : config.elasticsearch.username && config.elasticsearch.password
          ? { username: config.elasticsearch.username, password: config.elasticsearch.password }
          : undefined,

      Connection: HttpConnection,

      compression: config.elasticsearch.compression,
      maxRetries: config.elasticsearch.maxRetries,
      requestTimeout: config.elasticsearch.requestTimeout,

      name: config.server.name,
      opaqueIdPrefix: `${config.server.name}::`,

      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },

      context: {
        userAgent: `${config.server.name}/${config.server.version} (bun)`,
      },

      redaction: {
        type: "replace",
        additionalKeys: ["authorization", "x-elastic-client-meta"],
      },

      enableMetaHeader: config.elasticsearch.enableMetaHeader,
      disablePrototypePoisoningProtection: config.elasticsearch.disablePrototypePoisoningProtection,

      ...(config.elasticsearch.caCert && {
        tls: {
          ca: readFileSync(config.elasticsearch.caCert),
          rejectUnauthorized: true,
        },
      }),
    };

    logger.debug("Initializing Elasticsearch client with configuration:", {
      ...clientOptions,
      auth: clientOptions.auth ? "[REDACTED]" : undefined,
      tls: clientOptions.tls ? "[TLS_CONFIG_PRESENT]" : undefined,
      Connection: "HttpConnection",
    });

    const esClient = new Client(clientOptions);

    // Register connection pool event listeners for observability
    try {
      const pool = esClient.connectionPool as any;
      if (pool && typeof pool.on === "function") {
        pool.on("connection:dead", (connection: any, error: any) => {
          logger.error("Elasticsearch connection marked as dead", {
            url: connection.url,
            id: connection.id,
            error: error?.message,
          });
        });

        pool.on("connection:resurrect", (connection: any) => {
          logger.info("Elasticsearch connection resurrected", {
            url: connection.url,
            id: connection.id,
          });
        });
      }
    } catch (error) {
      logger.warn("Could not register connection pool events", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Test connection to Elasticsearch
    try {
      const info = await esClient.info();

      logger.info("Successfully connected to Elasticsearch", {
        version: info.version?.number,
        clusterName: info.cluster_name,
        clusterUuid: info.cluster_uuid,
        luceneVersion: info.version?.lucene_version,
      });

      const serverVersion = info.version?.number;
      const majorVersion = serverVersion ? Number.parseInt(serverVersion.split(".")[0], 10) : 0;

      if (majorVersion >= 9) {
        logger.info(`Connected to Elasticsearch ${serverVersion} - using modern client features`);
      } else if (majorVersion >= 8) {
        logger.info(`Connected to Elasticsearch ${serverVersion} - full feature support`);
      } else {
        logger.warn(`Connected to older Elasticsearch ${serverVersion} - some features may be limited`);
      }
    } catch (error: unknown) {
      logger.error("Failed to connect to Elasticsearch:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }

    // Create MCP server
    const server = new McpServer(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          notifications: {
            supportsProgress: true,
            supportsLogging: true,
          },
          tools: {
            listChanged: true,
          },
        } as any,
        instructions: `Elasticsearch MCP Server (${config.server.version}) - Comprehensive Elasticsearch operations with ${config.server.readOnlyMode ? "READ-ONLY" : "FULL-ACCESS"} mode`,
      },
    );

    // Register all tools with the validated client
    const registeredTools = registerAllTools(server, esClient);

    logger.info("All tools registered successfully", {
      serverName: config.server.name,
      version: config.server.version,
      readOnlyMode: config.server.readOnlyMode,
      toolCount: registeredTools.length,
      message: config.server.readOnlyMode ? "Destructive operations are restricted" : "All operations available",
    });

    return server;
  } catch (error: unknown) {
    logger.error("Error creating server:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
