#!/usr/bin/env bun

/* src/index.ts */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createElasticsearchMcpServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { config } from "./config.js";

async function main() {
  try {
    // Configuration is already loaded and validated in config.ts
    logger.info("Starting Elasticsearch MCP server with validated configuration", {
      url: config.elasticsearch.url,
      hasApiKey: !!config.elasticsearch.apiKey,
      hasUsername: !!config.elasticsearch.username,
      hasPassword: !!config.elasticsearch.password,
      hasCaCert: !!config.elasticsearch.caCert,
      readOnlyMode: config.server.readOnlyMode,
      readOnlyStrictMode: config.server.readOnlyStrictMode,
      maxQueryTimeout: config.server.maxQueryTimeout,
      maxResultsPerQuery: config.server.maxResultsPerQuery,
      transportMode: config.server.transportMode,
      port: config.server.port,
    });

    // Create MCP server using the centralized config
    const server = await createElasticsearchMcpServer(config);

    // Create transport based on configuration
    let transport;
    if (config.server.transportMode === 'sse') {
      // For future SSE support
      throw new Error("SSE transport not yet implemented");
    } else {
      transport = new StdioServerTransport();
    }
    
    await server.connect(transport);

    // Set up graceful shutdown
    const shutdown = async () => {
      logger.info("Shutting down server gracefully...");
      try {
        await transport.close();
        logger.info("Server shutdown completed");
      } catch (error) {
        logger.error("Error during shutdown:", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      process.exit(0);
    };

    // Handle signals
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Handle uncaught errors with better error reporting
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception - shutting down:", {
        error: error.message,
        stack: error.stack,
        name: error.name,
      });
      shutdown();
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled promise rejection - shutting down:", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
      shutdown();
    });

    logger.info("🚀 Elasticsearch MCP Server started successfully", {
      mode: config.server.readOnlyMode ? "READ-ONLY" : "FULL-ACCESS",
      strictMode: config.server.readOnlyStrictMode,
      transport: config.server.transportMode,
    });
  } catch (error) {
    logger.error("💥 Fatal error during startup:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error("❌ Failed to start server:", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
