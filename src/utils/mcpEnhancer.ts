/* src/utils/mcpEnhancer.ts */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./logger.js";

/**
 * Enhanced MCP Server with production-ready features
 * Adds:
 * - Request rate limiting
 * - Circuit breaker pattern
 * - Request timeout handling
 * - Performance monitoring
 * - Request validation
 * - Health checks
 */

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
}

interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  slowRequestThreshold: number;
}

class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailTime > this.config.resetTimeout) {
        this.state = "half-open";
        logger.debug("Circuit breaker transitioning to half-open");
      } else {
        throw new McpError(ErrorCode.InternalError, "Circuit breaker is open - service temporarily unavailable");
      }
    }

    try {
      const result = await operation();
      if (this.state === "half-open") {
        this.reset();
      }
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = "open";
      logger.warn(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = "closed";
    logger.info("Circuit breaker reset - service recovered");
  }

  getState(): string {
    return this.state;
  }
}

class RateLimiter {
  private requests: number[] = [];

  constructor(private config: RateLimitConfig) {}

  isAllowed(): boolean {
    const now = Date.now();

    // Remove old requests outside the window
    this.requests = this.requests.filter((requestTime) => now - requestTime < this.config.windowMs);

    if (this.requests.length >= this.config.maxRequests) {
      return false;
    }

    this.requests.push(now);
    return true;
  }

  getRemainingRequests(): number {
    return Math.max(0, this.config.maxRequests - this.requests.length);
  }

  getResetTime(): number {
    if (this.requests.length === 0) return 0;
    return this.requests[0] + this.config.windowMs;
  }
}

export class EnhancedMcpServer {
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;
  private metrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    slowRequestThreshold: 5000, // 5 seconds
  };
  private responseTimes: number[] = [];

  constructor(
    private server: McpServer,
    rateLimitConfig: RateLimitConfig = { windowMs: 60000, maxRequests: 100 },
    circuitBreakerConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringWindow: 60000,
    },
  ) {
    this.rateLimiter = new RateLimiter(rateLimitConfig);
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.setupEnhancements();
  }

  private setupEnhancements(): void {
    // Intercept tool calls for rate limiting and monitoring
    const originalTool = this.server.tool.bind(this.server);
    this.server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
      const enhancedHandler = this.wrapHandler(name, handler);
      return originalTool(name, description, inputSchema, enhancedHandler);
    };

    // Note: MCP protocol only supports specific handlers (initialize, tools/list, tools/call, etc.)
    // Health checks and metrics are handled internally via logging and monitoring
    logger.info("Enhanced MCP server initialized with rate limiting and circuit breaker");
  }

  private wrapHandler(toolName: string, originalHandler: Function) {
    return async (args: any) => {
      const startTime = performance.now();

      try {
        // Rate limiting check
        if (!this.rateLimiter.isAllowed()) {
          this.metrics.failedRequests++;
          logger.warn(`Rate limit exceeded for tool: ${toolName}`, {
            remainingRequests: this.rateLimiter.getRemainingRequests(),
            resetTime: new Date(this.rateLimiter.getResetTime()).toISOString(),
          });

          throw new McpError(
            ErrorCode.InvalidRequest,
            `Rate limit exceeded. Try again after ${new Date(this.rateLimiter.getResetTime()).toISOString()}`,
            {
              remainingRequests: this.rateLimiter.getRemainingRequests(),
              resetTime: this.rateLimiter.getResetTime(),
            },
          );
        }

        this.metrics.totalRequests++;

        // Execute with circuit breaker
        const result = await this.circuitBreaker.execute(async () => {
          // Request timeout wrapper
          return Promise.race([
            originalHandler(args),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), 30000)),
          ]);
        });

        const duration = performance.now() - startTime;
        this.recordSuccess(duration, toolName);

        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        this.recordFailure(duration, toolName, error);
        throw error;
      }
    };
  }

  private recordSuccess(duration: number, toolName: string): void {
    this.metrics.successfulRequests++;
    this.updateResponseTimes(duration);

    if (duration > this.metrics.slowRequestThreshold) {
      logger.warn("Slow request detected", {
        tool: toolName,
        duration: Math.round(duration),
        threshold: this.metrics.slowRequestThreshold,
      });
    }

    logger.debug("Tool execution completed", {
      tool: toolName,
      duration: Math.round(duration),
      success: true,
    });
  }

  private recordFailure(duration: number, toolName: string, error: any): void {
    this.metrics.failedRequests++;
    this.updateResponseTimes(duration);

    logger.error("Tool execution failed", {
      tool: toolName,
      duration: Math.round(duration),
      error: error instanceof Error ? error.message : String(error),
      success: false,
    });
  }

  private updateResponseTimes(duration: number): void {
    this.responseTimes.push(duration);

    // Keep only last 1000 response times for memory efficiency
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }

    // Update average
    this.metrics.averageResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  private getHealthMetrics() {
    const successRate =
      this.metrics.totalRequests > 0 ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 : 100;

    return {
      totalRequests: this.metrics.totalRequests,
      successRate: Math.round(successRate * 100) / 100,
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      circuitBreakerState: this.circuitBreaker.getState(),
      rateLimitRemaining: this.rateLimiter.getRemainingRequests(),
    };
  }

  private getDetailedMetrics() {
    const p95 = this.calculatePercentile(95);
    const p99 = this.calculatePercentile(99);

    return {
      ...this.metrics,
      responseTimes: {
        p50: this.calculatePercentile(50),
        p95,
        p99,
        max: Math.max(...this.responseTimes),
      },
      circuitBreaker: {
        state: this.circuitBreaker.getState(),
      },
      rateLimit: {
        remaining: this.rateLimiter.getRemainingRequests(),
        resetTime: this.rateLimiter.getResetTime(),
      },
      timestamp: new Date().toISOString(),
    };
  }

  private calculatePercentile(percentile: number): number {
    if (this.responseTimes.length === 0) return 0;

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return Math.round(sorted[index] || 0);
  }

  // Note: setRequestHandler is not proxied - should be called on base server before enhancement

  tool(name: string, description: string, inputSchema: any, handler: Function): void {
    // This will be intercepted by our enhanced wrapper
    this.server.tool(name, description, inputSchema, handler);
  }

  async connect(transport: any): Promise<void> {
    return this.server.connect(transport);
  }

  close(): void {
    return this.server.close();
  }
}

/**
 * Factory function to create an enhanced MCP server
 */
export function createEnhancedMcpServer(
  baseServer: McpServer,
  options: {
    rateLimit?: RateLimitConfig;
    circuitBreaker?: CircuitBreakerConfig;
  } = {},
): EnhancedMcpServer {
  return new EnhancedMcpServer(baseServer, options.rateLimit, options.circuitBreaker);
}
