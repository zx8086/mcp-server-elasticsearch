#!/usr/bin/env bun

/*
 * Copyright Elasticsearch B.V. and contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createElasticsearchMcpServer } from "../index";
import { logger } from "./utils/logger.js";

interface ElasticsearchConfig {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
  caCert?: string;
}

function loadConfigFromEnv(): ElasticsearchConfig {
  // Load configuration from environment variables
  const config: ElasticsearchConfig = {
    url: process.env.ES_URL || "http://localhost:9200",
    apiKey: process.env.ES_API_KEY,
    username: process.env.ES_USERNAME,
    password: process.env.ES_PASSWORD,
    caCert: process.env.ES_CA_CERT,
  };

  return config;
}

async function main(): Promise<void> {
  try {
    // Load configuration
    const config = loadConfigFromEnv();
    
    // Validate required configuration
    if (!config.url) {
      throw new Error("ES_URL environment variable is required");
    }
    
    if (!config.apiKey && (!config.username || !config.password)) {
      throw new Error("Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided");
    }

    // Create the MCP server
    const server = await createElasticsearchMcpServer(config);
    
    // Create transport
    const transport = new StdioServerTransport();
    
    // Connect server to transport
    await server.connect(transport);
    
    // Log successful startup
    logger.info("MCP Server started successfully and waiting for connections");
    
    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down...");
      await server.close();
      logger.info("Server closed successfully");
      process.exit(0);
    });

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception:", { 
        error: error.message,
        stack: error.stack 
      });
      process.exit(1);
    });

    process.on("unhandledRejection", (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      logger.error("Unhandled rejection:", { message });
      process.exit(1);
    });

  } catch (error) {
    // Only output critical errors that prevent startup
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Fatal error during startup:", { 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error("Startup failed:", { 
    error: errorMessage,
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
}); 