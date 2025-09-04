/* src/transport/bunSseTransport.ts */

/**
 * Bun-optimized SSE transport for maximum performance
 * Uses native Bun.serve() for superior HTTP handling
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Config } from "../config.js";
import { logger } from "../utils/logger.js";
import { BunRuntimeDetection, BunPerformanceTimer } from "../utils/bunOptimizer.js";
import { detectClient, generateSessionId, traceNamedMcpConnection } from "../utils/tracingEnhanced.js";

interface BunSSEConnection {
  transport: SSEServerTransport;
  sessionId: string;
  clientInfo: any;
  connectionId: string;
  connectedAt: number;
}

export class BunOptimizedSSETransport {
  private activeConnections = new Map<string, BunSSEConnection>();
  private server?: any; // Bun server instance
  private performanceTimer = new BunPerformanceTimer();

  constructor(
    private mcpServer: McpServer,
    private config: Config
  ) {}

  /**
   * Start optimized SSE server using Bun.serve()
   */
  async start(): Promise<void> {
    if (!BunRuntimeDetection.isBun()) {
      throw new Error("BunOptimizedSSETransport requires Bun runtime");
    }

    const PORT = this.config.server.port;
    const sseEndpoint = "/mcp";

    this.server = Bun.serve({
      port: PORT,
      hostname: "0.0.0.0",
      
      fetch: async (req: Request) => {
        const startTime = Bun.nanoseconds();
        
        try {
          const result = await this.handleBunRequest(req, sseEndpoint);
          
          // Log performance metrics
          const duration = (Bun.nanoseconds() - startTime) / 1_000_000;
          this.performanceTimer.recordMeasurement('request_handling', duration);
          
          return result;
        } catch (error) {
          logger.error("Error handling Bun request", {
            error: error instanceof Error ? error.message : String(error),
            url: req.url,
            method: req.method
          });
          
          return new Response("Internal Server Error", { status: 500 });
        }
      },

      // Bun-specific optimizations
      reusePort: true,
      
      error: (error) => {
        logger.error("Bun server error", {
          error: error.message,
          stack: error.stack
        });
        return new Response("Server Error", { status: 500 });
      }
    });

    logger.info(`🚀 Bun-optimized SSE server listening on port ${PORT}`, {
      runtime: "bun",
      sseEndpoint: "/sse",
      mcpEndpoint: `${sseEndpoint}?sessionId=<SESSION_ID>`,
      optimizations: ["native-http", "reuse-port", "performance-tracking"]
    });
  }

  /**
   * Handle incoming requests with Bun-specific optimizations
   */
  private async handleBunRequest(req: Request, sseEndpoint: string): Promise<Response> {
    const url = new URL(req.url);
    
    // Set CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    // Handle OPTIONS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { 
        status: 204, 
        headers: corsHeaders 
      });
    }

    // SSE connection establishment
    if (url.pathname.startsWith("/sse")) {
      return this.handleBunSSEConnection(req, sseEndpoint, corsHeaders);
    }

    // MCP protocol requests
    if (url.pathname === sseEndpoint) {
      return this.handleBunMCPRequest(req, corsHeaders);
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return this.handleHealthCheck();
    }

    // Metrics endpoint
    if (url.pathname === "/metrics") {
      return this.handleMetrics();
    }

    return new Response("Not Found", { 
      status: 404, 
      headers: corsHeaders 
    });
  }

  /**
   * Handle SSE connection with Bun optimizations
   */
  private async handleBunSSEConnection(
    req: Request, 
    sseEndpoint: string, 
    corsHeaders: Record<string, string>
  ): Promise<Response> {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    const clientIP = req.headers.get("x-forwarded-for") || 
                    req.headers.get("x-real-ip") || 
                    "unknown";
    const userAgent = req.headers.get("user-agent") || "Unknown";

    logger.info(`New Bun SSE connection from ${clientIP}`, {
      userAgent,
      protocol: "SSE",
      runtime: "bun"
    });

    // Create connection ID and session
    const connectionId = `bun-sse-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const clientInfo = detectClient("sse", Object.fromEntries(req.headers.entries()), userAgent);
    const sessionId = generateSessionId(connectionId, clientInfo);

    // Create SSE response with Bun optimizations
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Initialize SSE headers
    await writer.write(new TextEncoder().encode("data: {\"type\":\"connection\",\"id\":\"" + sessionId + "\"}\n\n"));

    // Create transport and connect
    try {
      const transport = new SSEServerTransport(sseEndpoint, {
        write: (data: string) => {
          writer.write(new TextEncoder().encode(`data: ${data}\n\n`));
        },
        end: () => {
          writer.close();
        }
      } as any);

      // Store connection info
      this.activeConnections.set(sessionId, {
        transport,
        sessionId,
        clientInfo,
        connectionId,
        connectedAt: Date.now()
      });

      // Connect with tracing if enabled
      if (this.config.langsmith.tracing) {
        const tracedConnection = traceNamedMcpConnection({
          connectionId,
          transportMode: "sse-bun",
          clientInfo,
          sessionId
        });
        await tracedConnection(async () => this.mcpServer.connect(transport));
      } else {
        await this.mcpServer.connect(transport);
      }

      logger.info("Bun SSE connection established", {
        sessionId,
        connectionId,
        client: clientInfo.name,
        runtime: "bun"
      });

    } catch (error) {
      logger.error("Failed to establish Bun SSE connection", {
        error: error instanceof Error ? error.message : String(error),
        connectionId,
        sessionId
      });

      await writer.write(new TextEncoder().encode("data: {\"error\":\"Connection failed\"}\n\n"));
      await writer.close();
    }

    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  }

  /**
   * Handle MCP POST requests with Bun optimizations
   */
  private async handleBunMCPRequest(
    req: Request, 
    corsHeaders: Record<string, string>
  ): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    try {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId) {
        return new Response("Missing sessionId parameter", { 
          status: 400, 
          headers: corsHeaders 
        });
      }

      const connection = this.activeConnections.get(sessionId);
      if (!connection) {
        return new Response("Session not found", { 
          status: 404, 
          headers: corsHeaders 
        });
      }

      // Use Bun's optimized request body reading
      const body = await req.text();

      // Handle the message through the transport
      await connection.transport.handlePostMessage(req as any, {
        writeHead: () => {},
        setHeader: () => {},
        end: (data: string) => {
          // Response handling would be managed by the transport
        }
      } as any, body);

      return new Response("OK", { 
        status: 200, 
        headers: corsHeaders 
      });

    } catch (error) {
      logger.error("Error handling Bun MCP request", {
        error: error instanceof Error ? error.message : String(error)
      });

      return new Response("Internal Server Error", { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  }

  /**
   * Health check endpoint
   */
  private handleHealthCheck(): Response {
    const stats = this.getConnectionStats();
    const performanceStats = this.performanceTimer.getStats('request_handling');

    return new Response(JSON.stringify({
      status: "healthy",
      runtime: "bun",
      timestamp: new Date().toISOString(),
      connections: stats,
      performance: performanceStats
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      }
    });
  }

  /**
   * Metrics endpoint
   */
  private handleMetrics(): Response {
    const stats = this.getDetailedStats();

    return new Response(JSON.stringify(stats, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      }
    });
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    const activeCount = this.activeConnections.size;
    const connections = Array.from(this.activeConnections.values()).map(conn => ({
      sessionId: conn.sessionId,
      client: conn.clientInfo.name,
      connectedAt: new Date(conn.connectedAt).toISOString(),
      duration: Date.now() - conn.connectedAt
    }));

    return {
      active: activeCount,
      total: connections.length,
      connections
    };
  }

  /**
   * Get detailed performance statistics
   */
  getDetailedStats() {
    const connectionStats = this.getConnectionStats();
    const performanceStats = this.performanceTimer.getStats('request_handling');
    
    return {
      runtime: "bun",
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
      },
      connections: connectionStats,
      performance: performanceStats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down Bun SSE server", {
      activeConnections: this.activeConnections.size,
      runtime: "bun"
    });

    try {
      // Close all connections
      for (const [sessionId, connection] of this.activeConnections) {
        try {
          connection.transport.close?.();
        } catch (error) {
          logger.debug("Error closing connection", {
            sessionId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      this.activeConnections.clear();

      // Stop the server
      if (this.server) {
        this.server.stop();
      }

      logger.info("Bun SSE server shutdown completed");
    } catch (error) {
      logger.error("Error during Bun SSE server shutdown", {
        error: error instanceof Error ? error.message : String(error)
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
        logger.warn("Bun SSE force shutdown timeout reached");
        resolve();
      }, timeoutMs);
    });

    await Promise.race([shutdownPromise, timeoutPromise]);
  }
}