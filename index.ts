#!/usr/bin/env bun

/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createElasticsearchMcpServer } from "./src/index.js";
import { logger } from "./src/utils/logger.js";

interface ElasticsearchConfig {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
  caCert?: string;
}

function loadConfigFromEnv(): ElasticsearchConfig {
  return {
    url: process.env.ES_URL || "http://localhost:9200",
    apiKey: process.env.ES_API_KEY,
    username: process.env.ES_USERNAME,
    password: process.env.ES_PASSWORD,
    caCert: process.env.ES_CA_CERT,
  };
}

async function main() {
  try {
    // Load and validate configuration
    const config = loadConfigFromEnv();
    logger.info("Starting Elasticsearch MCP server with config:", {
      url: config.url,
      hasApiKey: !!config.apiKey,
      hasUsername: !!config.username,
      hasPassword: !!config.password,
      hasCaCert: !!config.caCert,
    });

    // Create MCP server
    const server = await createElasticsearchMcpServer(config);

    // Create transport and connect server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Set up graceful shutdown
    const shutdown = async () => {
      logger.info("Shutting down server...");
      await transport.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception:", {
        error: error.message,
        stack: error.stack,
      });
      shutdown();
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled promise rejection:", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
      shutdown();
    });

    logger.info("Server started successfully and waiting for input");
  } catch (error) {
    logger.error("Fatal error during startup:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error("Failed to start server:", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
