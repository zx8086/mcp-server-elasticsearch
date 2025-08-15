#!/usr/bin/env bun

/* src/index.ts */

import http from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import getRawBody from "raw-body";
import { clearConfigWarnings, config, getConfigWarnings } from "./config.js";
import { createElasticsearchMcpServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { createSessionContext, runWithSession } from "./utils/sessionContext.js";
import { createConnectionMetadata, initializeTracing, traceMcpConnection } from "./utils/tracing.js";
import { detectClient, generateSessionId, traceNamedMcpConnection } from "./utils/tracingEnhanced.js";

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

      const PORT = config.server.port;
      const sseEndpoint = "/mcp";

      // Track active SSE connections for graceful shutdown
      const activeConnections = new Set<http.ServerResponse>();

      // Create HTTP server to handle both SSE connection and POST requests
      const httpServer = http.createServer(async (req, res) => {
        if (req.url?.startsWith("/sse")) {
          // Handle SSE connection (GET request)
          if (req.method === "GET") {
            const clientIP = req.socket.remoteAddress;
            const userAgent = req.headers["user-agent"] || "Unknown";
            logger.info(`New SSE connection from ${clientIP}, User-Agent: ${userAgent}`);
            logger.info(`Request headers: ${JSON.stringify(req.headers)}`);

            // Set up CORS headers
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");

            // Track this connection for graceful shutdown
            activeConnections.add(res);

            // Remove connection when it closes
            res.on("close", () => {
              activeConnections.delete(res);
              logger.debug("SSE connection closed", {
                activeConnections: activeConnections.size,
              });
            });

            // Create a new SSE transport for this connection
            const transport = new SSEServerTransport(sseEndpoint, res);

            // Generate connection ID for tracing
            const connectionId = `sse-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const sessionId = transport.sessionId || connectionId;

            // Detect client information
            const clientInfo = detectClient("sse", req.headers as Record<string, string>, userAgent);

            // Connect the server to this transport with enhanced tracing
            if (config.langsmith.tracing) {
              const tracedConnection = traceNamedMcpConnection({
                connectionId,
                transportMode: "sse",
                clientInfo,
                sessionId,
              });
              await tracedConnection(async () => server.connect(transport));
            } else {
              await server.connect(transport);
            }

            // Log successful connection
            logger.info("SSE connection established", {
              endpoint: sseEndpoint,
              sessionId,
              connectionId,
              client: clientInfo.name,
            });
          } else {
            // Handle preflight requests
            if (req.method === "OPTIONS") {
              res.writeHead(204, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
              });
              res.end();
            } else {
              // Method not allowed
              res.writeHead(405);
              res.end("Method not allowed");
            }
          }
        } else if (req.url === sseEndpoint) {
          // Handle POST requests with session routing
          if (req.method === "POST") {
            // Set CORS headers
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type");

            try {
              // Get session ID from URL query
              const sessionId = new URL(req.url, `http://${req.headers.host}`).searchParams.get("sessionId");

              if (!sessionId) {
                res.writeHead(400);
                res.end("Missing sessionId parameter");
                return;
              }

              // Find the transport for this session
              const connection = server.getConnectionBySessionId(sessionId);

              if (!connection) {
                res.writeHead(404);
                res.end("Session not found");
                return;
              }

              // Parse the body
              const body = await getRawBody(req, {
                limit: "4mb",
                encoding: "utf-8",
              });

              // Handle the message
              await connection.transport.handlePostMessage(req, res, body.toString());
            } catch (error) {
              logger.error("Error handling POST request", {
                error: error instanceof Error ? error.message : String(error),
              });
              res.writeHead(500);
              res.end("Internal server error");
            }
          } else if (req.method === "OPTIONS") {
            // Handle preflight requests
            res.writeHead(204, {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            });
            res.end();
          } else {
            // Method not allowed
            res.writeHead(405);
            res.end("Method not allowed");
          }
        } else {
          // Not found
          res.writeHead(404);
          res.end("Not found");
        }
      });

      // Start the HTTP server
      httpServer.listen(PORT, "0.0.0.0", () => {
        logger.info(`SSE HTTP server listening on port ${PORT}`);
        logger.info(`SSE endpoint: http://localhost:${PORT}/sse`);
        logger.info(`MCP endpoint: http://localhost:${PORT}${sseEndpoint}?sessionId=<SESSION_ID>`);
      });

      // Set up graceful shutdown for SSE mode
      const shutdown = async () => {
        logger.info("Shutting down SSE server gracefully...", {
          activeConnections: activeConnections.size,
        });

        try {
          // First, close all active SSE connections
          for (const connection of activeConnections) {
            try {
              connection.end();
            } catch (err) {
              logger.debug("Error closing SSE connection:", {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          activeConnections.clear();

          // Close the HTTP server to stop accepting new connections
          httpServer.close(() => {
            logger.info("HTTP server closed successfully");
            process.exit(0);
          });

          logger.info("Server shutdown initiated");

          // Force exit after timeout if server doesn't close gracefully
          setTimeout(() => {
            logger.warn("Forcing server shutdown after timeout");
            process.exit(0);
          }, 5000);
        } catch (error) {
          logger.error("Error during shutdown:", {
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
