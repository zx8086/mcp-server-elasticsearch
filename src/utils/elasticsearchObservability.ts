/* src/utils/elasticsearchObservability.ts */

import type { Client } from "@elastic/elasticsearch";
import { Transport, type TransportRequestParams } from "@elastic/transport";
import { getMetricsCollector } from "../monitoring/metricsCollector.js";
import { logger } from "./logger.js";
import { type TraceMetadata, withNestedTrace, isTracingActive, getCurrentTrace } from "./tracing.js";

// =============================================================================
// ELASTICSEARCH TRANSPORT OBSERVABILITY
// =============================================================================

export interface ElasticsearchRequestMetrics {
  method: string;
  path: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  requestSize?: number;
  responseSize?: number;
  retryCount?: number;
  connectionId?: string;
  nodeUrl?: string;
  error?: string;
  warning?: string;
}

export interface ElasticsearchConnectionMetrics {
  connectionAttempts: number;
  connectionFailures: number;
  activeConnections: number;
  connectionPoolSize: number;
  lastConnectionTime?: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
}

// Enhanced Transport class with comprehensive observability
export class ObservableTransport extends Transport {
  private requestMetrics: Map<string, ElasticsearchRequestMetrics> = new Map();
  private connectionMetrics: ElasticsearchConnectionMetrics = {
    connectionAttempts: 0,
    connectionFailures: 0,
    activeConnections: 0,
    connectionPoolSize: 0,
    averageResponseTime: 0,
    requestsPerSecond: 0,
    errorRate: 0,
  };
  private metricsWindow: ElasticsearchRequestMetrics[] = [];
  private readonly metricsWindowSize = 1000; // Keep last 1000 requests for calculations

  constructor(options: any) {
    super(options);

    // Initialize metrics collection interval
    this.startMetricsCollection();
  }

  private startMetricsCollection(): void {
    // Update aggregate metrics every 30 seconds
    setInterval(() => {
      this.updateAggregateMetrics();
    }, 30000);
  }

  private updateAggregateMetrics(): void {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // Filter recent requests for calculations
    const recentRequests = this.metricsWindow.filter((req) => (req.endTime || req.startTime) > fiveMinutesAgo);

    if (recentRequests.length > 0) {
      // Calculate average response time
      const durations = recentRequests.filter((req) => req.duration).map((req) => req.duration!);
      this.connectionMetrics.averageResponseTime =
        durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

      // Calculate requests per second
      this.connectionMetrics.requestsPerSecond = recentRequests.length / (5 * 60); // 5 minutes

      // Calculate error rate
      const errors = recentRequests.filter((req) => req.error || (req.statusCode && req.statusCode >= 400));
      this.connectionMetrics.errorRate = errors.length / recentRequests.length;

      // Send metrics to Prometheus if available
      try {
        const metricsCollector = getMetricsCollector();
        if (metricsCollector) {
          metricsCollector.recordElasticsearchMetrics({
            averageResponseTime: this.connectionMetrics.averageResponseTime,
            requestsPerSecond: this.connectionMetrics.requestsPerSecond,
            errorRate: this.connectionMetrics.errorRate,
            activeConnections: this.connectionMetrics.activeConnections,
          });
        }
      } catch (error) {
        // Silently continue if metrics collection fails
      }
    }

    // Clean old metrics to prevent memory leak
    this.metricsWindow = this.metricsWindow.filter((req) => (req.endTime || req.startTime) > fiveMinutesAgo);
  }

  async request(params: TransportRequestParams, options: any = {}): Promise<any> {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    const requestMetrics: ElasticsearchRequestMetrics = {
      method: params.method || "GET",
      path: params.path || "/",
      startTime,
      connectionId: options.connectionId || "unknown",
      nodeUrl: options.nodeUrl || "unknown",
      requestSize: this.calculateRequestSize(params),
      retryCount: 0,
    };

    this.requestMetrics.set(requestId, requestMetrics);
    this.connectionMetrics.connectionAttempts++;

    // Create trace metadata for nested tracing
    const traceMetadata: TraceMetadata = {
      operation: "elasticsearch_transport_request",
      toolName: `${requestMetrics.method} ${requestMetrics.path}`,
      index: this.extractIndexFromPath(requestMetrics.path),
    };

    // Log detailed request information
    logger.debug("Elasticsearch request initiated", {
      requestId,
      method: requestMetrics.method,
      path: requestMetrics.path,
      nodeUrl: requestMetrics.nodeUrl,
      requestSize: requestMetrics.requestSize,
      connectionPoolSize: this.connectionPool?.size || 0,
      activeConnections: this.connectionMetrics.activeConnections,
    });

    // CRITICAL FIX: Only create nested traces when NOT within tool execution
    // to avoid interfering with LangSmith tool-level tracing
    const shouldCreateNestedTrace = isTracingActive() && !this.isWithinToolExecution();
    
    const executeRequest = async () => {
      try {
        this.connectionMetrics.activeConnections++;

        const result = await super.request(params, {
          ...options,
          // Add request tracking
          onResponse: (response: any) => {
            this.handleResponse(requestId, response);
            if (options.onResponse) options.onResponse(response);
          },
          onRetry: (attempt: number) => {
            this.handleRetry(requestId, attempt);
            if (options.onRetry) options.onRetry(attempt);
          },
        });

        const endTime = Date.now();
        const finalMetrics = this.requestMetrics.get(requestId)!;
        finalMetrics.endTime = endTime;
        finalMetrics.duration = endTime - startTime;
        finalMetrics.responseSize = this.calculateResponseSize(result);
        finalMetrics.statusCode = result?.statusCode || 200;

        // Log successful response
        logger.debug("Elasticsearch request completed", {
          requestId,
          duration: finalMetrics.duration,
          statusCode: finalMetrics.statusCode,
          responseSize: finalMetrics.responseSize,
          retryCount: finalMetrics.retryCount,
          nodeUrl: finalMetrics.nodeUrl,
          nestedTraceCreated: shouldCreateNestedTrace,
        });

        // Add to metrics window
        this.metricsWindow.push({ ...finalMetrics });
        if (this.metricsWindow.length > this.metricsWindowSize) {
          this.metricsWindow.shift();
        }

        this.connectionMetrics.activeConnections--;
        this.connectionMetrics.lastConnectionTime = endTime;

        return result;
      } catch (error: any) {
        const endTime = Date.now();
        const finalMetrics = this.requestMetrics.get(requestId)!;
        finalMetrics.endTime = endTime;
        finalMetrics.duration = endTime - startTime;
        finalMetrics.error = error.message || "Unknown error";
        finalMetrics.statusCode = error.statusCode || 500;

        this.connectionMetrics.connectionFailures++;
        this.connectionMetrics.activeConnections--;

        // Enhanced error logging
        logger.error("Elasticsearch request failed", {
          requestId,
          duration: finalMetrics.duration,
          error: finalMetrics.error,
          statusCode: finalMetrics.statusCode,
          retryCount: finalMetrics.retryCount,
          nodeUrl: finalMetrics.nodeUrl,
          path: finalMetrics.path,
          method: finalMetrics.method,
          connectionFailures: this.connectionMetrics.connectionFailures,
          errorType: this.classifyError(error),
          nestedTraceCreated: shouldCreateNestedTrace,
        });

        // Add to metrics window even for errors
        this.metricsWindow.push({ ...finalMetrics });
        if (this.metricsWindow.length > this.metricsWindowSize) {
          this.metricsWindow.shift();
        }

        throw error;
      } finally {
        this.requestMetrics.delete(requestId);
      }
    };

    // Execute with or without nested tracing based on context
    if (shouldCreateNestedTrace) {
      return withNestedTrace(
        `ES ${requestMetrics.method} ${requestMetrics.path}`,
        "retriever",
        executeRequest,
        traceMetadata,
      );
    } else {
      return executeRequest();
    }
  }

  /**
   * CRITICAL: Detect if we're within a tool execution to avoid trace conflicts
   * This prevents nested trace creation during MCP tool executions
   */
  private isWithinToolExecution(): boolean {
    // Simple heuristic: check if we have an active trace that looks like a tool trace
    try {
      const currentTrace = getCurrentTrace();
      
      if (!currentTrace) {
        return false;
      }
      
      // Check if the current trace is a tool-level trace (our tools start with "elasticsearch_")
      const traceName = currentTrace.name || "";
      return traceName.startsWith("elasticsearch_") || currentTrace.run_type === "tool";
    } catch (error) {
      // If we can't detect trace context, assume we're within tool execution to be safe
      return true;
    }
  }

  private handleResponse(requestId: string, response: any): void {
    const metrics = this.requestMetrics.get(requestId);
    if (!metrics) return;

    metrics.statusCode = response.statusCode;
    metrics.responseSize = this.calculateResponseSize(response);

    // Log response details for debugging
    if (response.statusCode >= 400) {
      logger.warn("Elasticsearch response with error status", {
        requestId,
        statusCode: response.statusCode,
        path: metrics.path,
        method: metrics.method,
        duration: Date.now() - metrics.startTime,
      });
    }

    // Check for Elasticsearch warnings
    if (response.headers && response.headers.warning) {
      metrics.warning = response.headers.warning;
      logger.warn("Elasticsearch API warning", {
        requestId,
        warning: metrics.warning,
        path: metrics.path,
        method: metrics.method,
      });
    }
  }

  private handleRetry(requestId: string, attempt: number): void {
    const metrics = this.requestMetrics.get(requestId);
    if (!metrics) return;

    metrics.retryCount = attempt;

    logger.warn("Elasticsearch request retry", {
      requestId,
      attempt,
      path: metrics.path,
      method: metrics.method,
      duration: Date.now() - metrics.startTime,
      nodeUrl: metrics.nodeUrl,
    });
  }

  private calculateRequestSize(params: TransportRequestParams): number {
    try {
      if (params.body) {
        if (typeof params.body === "string") {
          return Buffer.byteLength(params.body, "utf8");
        }
        if (Buffer.isBuffer(params.body)) {
          return params.body.length;
        }
        return Buffer.byteLength(JSON.stringify(params.body), "utf8");
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private calculateResponseSize(response: any): number {
    try {
      if (!response || !response.body) return 0;

      if (typeof response.body === "string") {
        return Buffer.byteLength(response.body, "utf8");
      }
      if (Buffer.isBuffer(response.body)) {
        return response.body.length;
      }
      return Buffer.byteLength(JSON.stringify(response.body), "utf8");
    } catch {
      return 0;
    }
  }

  private extractIndexFromPath(path: string): string | undefined {
    // Extract index name from common Elasticsearch paths
    const indexPatterns = [
      /^\/([^\/]+)\/_search/, // /index/_search
      /^\/([^\/]+)\/_doc/, // /index/_doc
      /^\/([^\/]+)\/_mapping/, // /index/_mapping
      /^\/([^\/]+)\/_settings/, // /index/_settings
      /^\/([^\/]+)\//, // /index/...
    ];

    for (const pattern of indexPatterns) {
      const match = path.match(pattern);
      if (match) return match[1];
    }

    return undefined;
  }

  private classifyError(error: any): string {
    if (!error) return "unknown";

    const statusCode = error.statusCode || error.status;
    const message = error.message || "";

    if (statusCode) {
      if (statusCode >= 500) return "server_error";
      if (statusCode >= 400) return "client_error";
    }

    if (message.includes("timeout")) return "timeout";
    if (message.includes("connection")) return "connection_error";
    if (message.includes("parse")) return "parse_error";
    if (message.includes("not found")) return "not_found";

    return "unknown";
  }

  // Public methods for metrics access
  public getConnectionMetrics(): ElasticsearchConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  public getRecentRequests(minutes = 5): ElasticsearchRequestMetrics[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.metricsWindow.filter((req) => (req.endTime || req.startTime) > cutoff);
  }

  public getHealthStatus(): {
    status: "healthy" | "degraded" | "unhealthy";
    metrics: ElasticsearchConnectionMetrics;
    recentErrors: number;
  } {
    const recentRequests = this.getRecentRequests(5);
    const recentErrors = recentRequests.filter((req) => req.error || (req.statusCode && req.statusCode >= 400));

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (this.connectionMetrics.errorRate > 0.5) {
      status = "unhealthy";
    } else if (this.connectionMetrics.errorRate > 0.1 || this.connectionMetrics.averageResponseTime > 5000) {
      status = "degraded";
    }

    return {
      status,
      metrics: this.getConnectionMetrics(),
      recentErrors: recentErrors.length,
    };
  }
}

// =============================================================================
// CLIENT ENHANCEMENT UTILITIES
// =============================================================================

export function enhanceElasticsearchClient(client: Client): Client {
  // Add event listeners for connection events (safely check if available)
  try {
    if (client.connectionPool && typeof client.connectionPool.on === "function") {
      client.connectionPool.on("connection:new", (connection: any) => {
        logger.info("New Elasticsearch connection established", {
          url: connection.url,
          id: connection.id,
        });
      });

      client.connectionPool.on("connection:remove", (connection: any) => {
        logger.info("Elasticsearch connection removed", {
          url: connection.url,
          id: connection.id,
        });
      });

      client.connectionPool.on("connection:dead", (connection: any, error: any) => {
        logger.error("Elasticsearch connection marked as dead", {
          url: connection.url,
          id: connection.id,
          error: error?.message,
        });
      });

      client.connectionPool.on("connection:resurrect", (connection: any) => {
        logger.info("Elasticsearch connection resurrected", {
          url: connection.url,
          id: connection.id,
        });
      });

      logger.info("✅ Elasticsearch connection pool events registered");
    } else {
      logger.debug("Connection pool events not available - continuing without connection events");
    }
  } catch (error) {
    logger.warn("Could not register connection pool events", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return client;
}

// =============================================================================
// DIAGNOSTIC UTILITIES
// =============================================================================

export class ElasticsearchDiagnostics {
  constructor(private transport: ObservableTransport) {}

  public async generateHealthReport(): Promise<{
    overall: "healthy" | "degraded" | "unhealthy";
    transport: ReturnType<ObservableTransport["getHealthStatus"]>;
    recommendations: string[];
  }> {
    const transportHealth = this.transport.getHealthStatus();
    const recommendations: string[] = [];

    if (transportHealth.metrics.errorRate > 0.1) {
      recommendations.push("High error rate detected - check Elasticsearch cluster health");
    }

    if (transportHealth.metrics.averageResponseTime > 5000) {
      recommendations.push("High response times - consider optimizing queries or scaling cluster");
    }

    if (transportHealth.metrics.connectionFailures > 10) {
      recommendations.push("Frequent connection failures - check network connectivity");
    }

    return {
      overall: transportHealth.status,
      transport: transportHealth,
      recommendations,
    };
  }

  public getDetailedMetrics(): {
    transport: ElasticsearchConnectionMetrics;
    recentRequests: ElasticsearchRequestMetrics[];
    slowQueries: ElasticsearchRequestMetrics[];
    errorSummary: Record<string, number>;
  } {
    const recentRequests = this.transport.getRecentRequests(15);
    const slowQueries = recentRequests.filter((req) => (req.duration || 0) > 2000);

    const errorSummary: Record<string, number> = {};
    recentRequests
      .filter((req) => req.error)
      .forEach((req) => {
        const errorType = req.error || "unknown";
        errorSummary[errorType] = (errorSummary[errorType] || 0) + 1;
      });

    return {
      transport: this.transport.getConnectionMetrics(),
      recentRequests: recentRequests.slice(0, 50), // Last 50 requests
      slowQueries,
      errorSummary,
    };
  }
}
