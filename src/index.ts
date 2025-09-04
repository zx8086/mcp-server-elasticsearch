#!/usr/bin/env bun

/* src/index.ts */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { clearConfigWarnings, config, getConfigWarnings } from "./config.js";
import { createElasticsearchMcpServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { createSessionContext, runWithSession } from "./utils/sessionContext.js";
import { createConnectionMetadata, initializeTracing, traceMcpConnection } from "./utils/tracing.js";
import { detectClient, generateSessionId, traceNamedMcpConnection } from "./utils/tracingEnhanced.js";
import { SSETransportManager } from "./transport/sseTransport.js";

async function main() {
  try {
    // Initialize tracing first
    initializeTracing();

    // Log any configuration warnings now that logger is available
    const configWarnings = getConfigWarnings();
    if (configWarnings.length > 0) {
      for (const warning of configWarnings) {
        logger.warn(warning);
      }
      clearConfigWarnings(); // Clear warnings after logging
    }

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
    if (config.server.transportMode === "sse") {
      logger.info("Using SSE transport mode");
      
      // Create and start SSE transport manager
      const sseTransport = new SSETransportManager(server, config);
      await sseTransport.start();

      // Set up graceful shutdown for SSE mode
      const shutdown = async () => {
        logger.info("Shutting down SSE server gracefully...");
        
        try {
          await sseTransport.forceShutdown(5000);
          logger.info("SSE server shutdown completed");
          process.exit(0);
        } catch (error) {
          logger.error("Error during SSE shutdown:", {
            error: error instanceof Error ? error.message : String(error),
          });
          process.exit(1);
        }
      };

      // Handle signals
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Handle uncaught errors
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

      const modeInfo = `🌐 SSE on port ${config.server.port}`;
      logger.info(`🚀 Elasticsearch MCP Server started successfully with ${modeInfo}`, {
        mode: config.server.readOnlyMode ? "READ-ONLY" : "FULL-ACCESS",
        strictMode: config.server.readOnlyStrictMode,
        transport: config.server.transportMode,
        stats: sseTransport.getStats(),
      });
    } else {
      // Use stdio transport
      logger.info("Using stdio transport mode");
      const transport = new StdioServerTransport();

      // Generate connection ID for tracing
      const connectionId = `stdio-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Detect client information (Claude Desktop for stdio)
      const clientInfo = detectClient("stdio");
      const sessionId = generateSessionId(connectionId, clientInfo);

      // Create session context
      const sessionContext = createSessionContext(connectionId, "stdio", sessionId, clientInfo);

      // Connect with session context and enhanced tracing if enabled
      await runWithSession(sessionContext, async () => {
        if (config.langsmith.tracing) {
          const tracedConnection = traceNamedMcpConnection({
            connectionId,
            transportMode: "stdio",
            clientInfo,
            sessionId,
          });
          await tracedConnection(async () => server.connect(transport));
        } else {
          await server.connect(transport);
        }
      });

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

      const modeInfo = "📝 STDIO";
      logger.info(`🚀 Elasticsearch MCP Server started successfully with ${modeInfo}`, {
        mode: config.server.readOnlyMode ? "READ-ONLY" : "FULL-ACCESS",
        strictMode: config.server.readOnlyStrictMode,
        transport: config.server.transportMode,
      });
    }
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
