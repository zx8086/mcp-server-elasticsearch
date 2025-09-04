/* src/transport/sseTransport.ts */

import http from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import getRawBody from "raw-body";
import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";
import { detectClient, generateSessionId, traceNamedMcpConnection } from "../utils/tracingEnhanced.js";

interface SSEConnection {
  transport: SSEServerTransport;
  sessionId: string;
  clientInfo: any;
  connectionId: string;
}

export class SSETransportManager {
  private activeConnections = new Set<http.ServerResponse>();
  private httpServer?: http.Server;

  constructor(
    private server: McpServer,
    private config: Config
  ) {}

  /**
   * Start SSE server
   */
  async start(): Promise<void> {
    const PORT = this.config.server.port;
    const sseEndpoint = "/mcp";

    // Create HTTP server
    this.httpServer = http.createServer(async (req, res) => {
      await this.handleRequest(req, res, sseEndpoint);
    });

    // Start server
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(PORT, "0.0.0.0", (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    logger.info(`🌐 SSE HTTP server listening on port ${PORT}`, {
      sseEndpoint: `/sse`,
      mcpEndpoint: `${sseEndpoint}?sessionId=<SESSION_ID>`,
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    sseEndpoint: string
  ): Promise<void> {
    // Set CORS headers
    this.setCorsHeaders(res);

    if (req.url?.startsWith("/sse")) {
      await this.handleSSEConnection(req, res, sseEndpoint);
    } else if (req.url === sseEndpoint) {
      await this.handleMCPRequest(req, res);
    } else if (req.method === "OPTIONS") {
      this.handleOptionsRequest(res);
    } else {
      this.handleNotFound(res);
    }
  }

  /**
   * Handle SSE connection establishment
   */
  private async handleSSEConnection(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    sseEndpoint: string
  ): Promise<void> {
    if (req.method !== "GET") {
      if (req.method === "OPTIONS") {
        this.handleOptionsRequest(res);
      } else {
        res.writeHead(405);
        res.end("Method not allowed");
      }
      return;
    }

    const clientIP = req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"] || "Unknown";
    
    logger.info(`New SSE connection from ${clientIP}`, {
      userAgent,
      headers: req.headers,
    });

    // Track connection for cleanup
    this.activeConnections.add(res);

    // Remove connection when it closes
    res.on("close", () => {
      this.activeConnections.delete(res);
      logger.debug("SSE connection closed", {
        activeConnections: this.activeConnections.size,
      });
    });

    // Create SSE transport
    const transport = new SSEServerTransport(sseEndpoint, res);
    const connectionId = `sse-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const sessionId = transport.sessionId || connectionId;

    // Detect client information
    const clientInfo = detectClient("sse", req.headers as Record<string, string>, userAgent);

    try {
      // Connect with tracing if enabled
      if (this.config.langsmith.tracing) {
        const tracedConnection = traceNamedMcpConnection({
          connectionId,
          transportMode: "sse",
          clientInfo,
          sessionId,
        });
        await tracedConnection(async () => this.server.connect(transport));
      } else {
        await this.server.connect(transport);
      }

      logger.info("SSE connection established", {
        endpoint: sseEndpoint,
        sessionId,
        connectionId,
        client: clientInfo.name,
      });
    } catch (error) {
      logger.error("Failed to establish SSE connection", {
        error: error instanceof Error ? error.message : String(error),
        connectionId,
      });
      
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal server error");
      }
    }
  }

  /**
   * Handle MCP POST requests
   */
  private async handleMCPRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    if (req.method !== "POST") {
      if (req.method === "OPTIONS") {
        this.handleOptionsRequest(res);
      } else {
        res.writeHead(405);
        res.end("Method not allowed");
      }
      return;
    }

    try {
      // Get session ID from URL query
      const sessionId = new URL(req.url!, `http://${req.headers.host}`).searchParams.get("sessionId");

      if (!sessionId) {
        res.writeHead(400);
        res.end("Missing sessionId parameter");
        return;
      }

      // Find the transport for this session
      const connection = this.server.getConnectionBySessionId(sessionId);

      if (!connection) {
        res.writeHead(404);
        res.end("Session not found");
        return;
      }

      // Parse the request body
      const body = await getRawBody(req, {
        limit: "4mb",
        encoding: "utf-8",
      });

      // Handle the message
      await connection.transport.handlePostMessage(req, res, body.toString());
      
    } catch (error) {
      logger.error("Error handling MCP POST request", {
        error: error instanceof Error ? error.message : String(error),
      });
      
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal server error");
      }
    }
  }

  /**
   * Set CORS headers
   */
  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  /**
   * Handle OPTIONS requests
   */
  private handleOptionsRequest(res: http.ServerResponse): void {
    res.writeHead(204);
    res.end();
  }

  /**
   * Handle 404 Not Found
   */
  private handleNotFound(res: http.ServerResponse): void {
    res.writeHead(404);
    res.end("Not found");
  }

  /**
   * Get server statistics
   */
  getStats(): { activeConnections: number; port: number } {
    return {
      activeConnections: this.activeConnections.size,
      port: this.config.server.port,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down SSE server gracefully", {
      activeConnections: this.activeConnections.size,
    });

    try {
      // Close all active SSE connections
      for (const connection of this.activeConnections) {
        try {
          connection.end();
        } catch (error) {
          logger.debug("Error closing SSE connection:", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.activeConnections.clear();

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve, reject) => {
          this.httpServer!.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }

      logger.info("SSE server shutdown completed");
    } catch (error) {
      logger.error("Error during SSE server shutdown", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Force shutdown with timeout
   */
  async forceShutdown(timeoutMs = 5000): Promise<void> {
    const shutdownPromise = this.shutdown();
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.warn("Force shutdown timeout reached");
        resolve();
      }, timeoutMs);
    });

    await Promise.race([shutdownPromise, timeoutPromise]);
  }
}