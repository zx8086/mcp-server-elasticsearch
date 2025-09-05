#!/usr/bin/env bun

/* src/server.ts */

import { readFileSync } from "node:fs";
import { Client, type ClientOptions, Transport, TransportRequestParams, type estypes } from "@elastic/elasticsearch";
import { HttpConnection } from "@elastic/transport";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { MetricsEndpoint } from "./monitoring/metricsEndpoint.js";
import { registerAllTools } from "./tools/index.js";
import { initializeCaches } from "./utils/cache.js";
import { initializeDefaultCircuitBreakers } from "./utils/circuitBreaker.js";
import { getGlobalConnectionPool } from "./utils/connectionPooling.js";
import { initializeConnectionWarming, preWarmEndpoints } from "./utils/connectionWarming.js";
import { initializeHealthMonitor } from "./utils/healthCheck.js";
import { logger } from "./utils/logger.js";
import { createEnhancedMcpServer } from "./utils/mcpEnhancer.js";
import { initializeRateLimiters, initializeResourceMonitor } from "./utils/rateLimiter.js";
import { initializeReadOnlyManager } from "./utils/readOnlyMode.js";
import { createConnectionMetadata, initializeTracing, traceMcpConnection } from "./utils/tracing.js";
import { checkElasticsearchConnection, testBasicOperations, testModernFeatures } from "./validation.js";

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
    // Initialize tracing if enabled
    initializeTracing();

    // Initialize read-only mode manager with config values
    initializeReadOnlyManager(config.server.readOnlyMode, config.server.readOnlyStrictMode);

    if (config.server.readOnlyMode) {
      logger.info("🔒 READ-ONLY MODE ACTIVE", {
        strictMode: config.server.readOnlyStrictMode,
        behavior: config.server.readOnlyStrictMode
          ? "Destructive operations will be BLOCKED"
          : "Destructive operations will show WARNINGS",
      });
    }

    // Build Elasticsearch client configuration
    const clientOptions: ClientOptions = {
      node: config.elasticsearch.url,
      auth: config.elasticsearch.apiKey
        ? { apiKey: config.elasticsearch.apiKey }
        : config.elasticsearch.username && config.elasticsearch.password
          ? { username: config.elasticsearch.username, password: config.elasticsearch.password }
          : undefined,

      // Use HttpConnection for better compatibility
      Connection: HttpConnection,

      // Apply configuration from config
      compression: config.elasticsearch.compression,
      maxRetries: config.elasticsearch.maxRetries,
      requestTimeout: config.elasticsearch.requestTimeout,

      // Client identification and observability
      name: config.server.name,
      opaqueIdPrefix: `${config.server.name}::`,

      // Headers for better compatibility
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },

      // User agent with version info
      context: {
        userAgent: `${config.server.name}/${config.server.version} (bun)`,
      },

      // Enhanced error handling and redaction
      redaction: {
        type: "replace",
        additionalKeys: ["authorization", "x-elastic-client-meta"],
      },

      // Use configuration for meta header
      enableMetaHeader: config.elasticsearch.enableMetaHeader,

      // Use configuration for prototype poisoning protection
      disablePrototypePoisoningProtection: config.elasticsearch.disablePrototypePoisoningProtection,

      // Add TLS configuration if CA cert is provided
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
    logger.info("✅ Elasticsearch client created successfully");

    // Initialize connection pool with the primary client
    const connectionPool = getGlobalConnectionPool({
      healthCheckInterval: 30000,
      maxErrorCount: 3,
      loadBalanceStrategy: "fastest-response",
    });
    connectionPool.addConnection(config.elasticsearch.url, esClient);

    logger.info("📡 Connection pool initialized", {
      primaryUrl: config.elasticsearch.url,
      strategy: "fastest-response",
    });

    // Enhanced connection test with configuration-aware timeouts
    try {
      logger.debug("Testing connection to Elasticsearch...");

      // Use the client's info method for initial connection test
      const info = await esClient.info();

      logger.info("🌐 Successfully connected to Elasticsearch", {
        version: info.version?.number,
        clusterName: info.cluster_name,
        clusterUuid: info.cluster_uuid,
        luceneVersion: info.version?.lucene_version,
      });

      // Store version info for feature detection
      const serverVersion = info.version?.number;
      const majorVersion = serverVersion ? Number.parseInt(serverVersion.split(".")[0]) : 0;

      if (majorVersion >= 9) {
        logger.info(`🆕 Connected to Elasticsearch ${serverVersion} - using modern client features`);
      } else if (majorVersion >= 8) {
        logger.info(`⚡ Connected to Elasticsearch ${serverVersion} - full feature support`);
      } else {
        logger.warn(`⚠️ Connected to older Elasticsearch ${serverVersion} - some features may be limited`);
      }
    } catch (error: unknown) {
      logger.error("❌ Failed to connect to Elasticsearch:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }

    // Test connection with configuration-aware validation
    try {
      const connectionCheck = await checkElasticsearchConnection(esClient);
      if (!connectionCheck.valid) {
        logger.error("Connection validation failed:", {
          errors: connectionCheck.errors,
          warnings: connectionCheck.warnings || [],
        });
        throw new Error(`Connection validation failed: ${connectionCheck.errors.join(", ")}`);
      }
      if (connectionCheck.warnings && connectionCheck.warnings.length > 0) {
        logger.info("Connection validation completed with notes:", {
          warnings: connectionCheck.warnings,
        });
      }
    } catch (error) {
      logger.warn("Connection validation test failed, but continuing:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Test basic operations with error handling
    try {
      const operationsCheck = await testBasicOperations(esClient);
      if (!operationsCheck.valid) {
        logger.warn("Some basic operations failed:", {
          errors: operationsCheck.errors,
          warnings: operationsCheck.warnings || [],
        });
      } else {
        logger.info("✅ All basic operations successful");
      }
    } catch (error) {
      logger.warn("Basic operations test failed, but continuing:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Test modern features
    try {
      const modernFeaturesCheck = await testModernFeatures(esClient);
      const warnings = modernFeaturesCheck.warnings || [];
      if (warnings.length > 0) {
        logger.info("🔧 Modern features availability:", { features: warnings });
      }
    } catch (error) {
      logger.warn("Modern features test failed, but continuing:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info("🏗️ Creating MCP Server instance");
    const server = new McpServer({
      name: config.server.name,
      version: config.server.version,
    });

    // Register all tools with the validated client
    const registeredTools = registerAllTools(server, esClient);

    logger.info("🛠️ All tools registered successfully", {
      serverName: config.server.name,
      version: config.server.version,
      readOnlyMode: config.server.readOnlyMode,
      toolCount: registeredTools.length,
      message: config.server.readOnlyMode ? "Destructive operations are restricted" : "All operations available",
    });

    // Initialize resource management
    logger.info("🛡️ Initializing resource management");

    // Initialize rate limiters with configuration-based limits
    initializeRateLimiters({
      toolLimits: {
        windowMs: 60000, // 1 minute
        maxRequests: config.server.maxResultsPerQuery || 1000, // Use config value
      },
      connectionLimits: {
        windowMs: 60000, // 1 minute
        maxRequests: 50, // 50 connections per minute
      },
    });

    // Initialize resource monitor with memory threshold
    const memoryThresholdMB = Math.floor((config.server.maxResponseSizeBytes / 1024 / 1024) * 10) || 1000;
    initializeResourceMonitor(memoryThresholdMB);

    // Initialize circuit breakers for fault tolerance
    initializeDefaultCircuitBreakers();

    // Initialize performance optimizations
    logger.info("⚡ Initializing performance optimizations");

    // Initialize caches for query results, mappings, and cluster info
    initializeCaches();

    // Initialize connection warming
    const connectionWarmer = initializeConnectionWarming(esClient, {
      enabled: true,
      warmupDelayMs: 2000, // Start warming after 2 seconds
      warmupIntervalMs: 5 * 60 * 1000, // Warmup every 5 minutes
      keepAliveIntervalMs: 30 * 1000, // Keep-alive every 30 seconds
    });

    // Pre-warm endpoints during startup
    try {
      await preWarmEndpoints(esClient);
      logger.info("✅ Connection pre-warming completed");
    } catch (error) {
      logger.warn("⚠️ Connection pre-warming failed, continuing anyway", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Start connection warming
    connectionWarmer.start();

    // Initialize health monitoring
    logger.info("💚 Initializing health monitoring");
    const healthMonitor = initializeHealthMonitor(esClient);
    healthMonitor.start();

    // Initialize Prometheus metrics endpoint (optional - auto-detects prom-client)
    logger.info("📊 Initializing monitoring systems");
    const metricsEndpoint = new MetricsEndpoint();
    try {
      await metricsEndpoint.start();
      if (metricsEndpoint.isRunning()) {
        logger.info("✅ Prometheus metrics endpoint started", {
          port: metricsEndpoint.getPort(),
          endpoints: [
            `http://localhost:${metricsEndpoint.getPort()}/metrics`,
            `http://localhost:${metricsEndpoint.getPort()}/health`,
          ],
        });
      }
    } catch (_error) {
      // MetricsEndpoint handles graceful degradation internally
      logger.debug("Metrics endpoint initialization completed", {
        running: metricsEndpoint.isRunning(),
      });
    }

    logger.info("🏥 Production systems active", {
      rateLimiting: "Tool and connection limits enabled",
      resourceMonitoring: `Memory threshold: ${memoryThresholdMB}MB`,
      circuitBreakers: "Fault tolerance for ES operations",
      caching: "Multi-tier response caching enabled",
      connectionWarming: "Pre-warming and keep-alive active",
      healthChecks: "30-second intervals",
    });

    return server;
  } catch (error: unknown) {
    logger.error("💥 Error creating server:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
