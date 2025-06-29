#!/usr/bin/env bun

/* src/index.ts */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createElasticsearchMcpServer } from "./server.js";
import { logger } from "./utils/logger.js";
import { config } from "./config.js";
import http from "http";
import getRawBody from "raw-body";

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
    if (config.server.transportMode === 'sse') {
      logger.info("Using SSE transport mode");
      
      const PORT = config.server.port;
      const sseEndpoint = "/mcp";
      
      // Create HTTP server to handle both SSE connection and POST requests
      const httpServer = http.createServer(async (req, res) => {
        if (req.url?.startsWith('/sse')) {
          // Handle SSE connection (GET request)
          if (req.method === 'GET') {
            logger.info(`New SSE connection from ${req.socket.remoteAddress}`);
            
            // Set up CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            // Create a new SSE transport for this connection
            const transport = new SSEServerTransport(sseEndpoint, res);
            
            // Connect the server to this transport
            await server.connect(transport);
            
            // Log successful connection
            logger.info(`SSE connection established, endpoint: ${sseEndpoint}`);
          } else {
            // Handle preflight requests
            if (req.method === 'OPTIONS') {
              res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
              });
              res.end();
            } else {
              // Method not allowed
              res.writeHead(405);
              res.end('Method not allowed');
            }
          }
        } else if (req.url === sseEndpoint) {
          // Handle POST requests with session routing
          if (req.method === 'POST') {
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            
            try {
              // Get session ID from URL query
              const sessionId = new URL(req.url, `http://${req.headers.host}`).searchParams.get('sessionId');
              
              if (!sessionId) {
                res.writeHead(400);
                res.end('Missing sessionId parameter');
                return;
              }
              
              // Find the transport for this session
              const connection = server.getConnectionBySessionId(sessionId);
              
              if (!connection) {
                res.writeHead(404);
                res.end('Session not found');
                return;
              }
              
              // Parse the body
              const body = await getRawBody(req, {
                limit: '4mb',
                encoding: 'utf-8'
              });
              
              // Handle the message
              await connection.transport.handlePostMessage(req, res, body.toString());
            } catch (error) {
              logger.error("Error handling POST request", {
                error: error instanceof Error ? error.message : String(error),
              });
              res.writeHead(500);
              res.end('Internal server error');
            }
          } else if (req.method === 'OPTIONS') {
            // Handle preflight requests
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end();
          } else {
            // Method not allowed
            res.writeHead(405);
            res.end('Method not allowed');
          }
        } else {
          // Not found
          res.writeHead(404);
          res.end('Not found');
        }
      });
      
      // Start the HTTP server
      httpServer.listen(PORT, '0.0.0.0', () => {
        logger.info(`SSE HTTP server listening on port ${PORT}`);
        logger.info(`SSE endpoint: http://localhost:${PORT}/sse`);
        logger.info(`MCP endpoint: http://localhost:${PORT}${sseEndpoint}?sessionId=<SESSION_ID>`);
      });
      
      // Set up graceful shutdown
      const shutdown = async () => {
        logger.info("Shutting down server gracefully...");
        try {
          server.disconnectAll();
          httpServer.close();
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

      const modeInfo = '📝 STDIO';
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
