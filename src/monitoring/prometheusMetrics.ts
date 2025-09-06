import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Use dynamic import for Prometheus client with fallback
let promClient: any = null;
let metricsEnabled = false;

try {
  promClient = require("prom-client");
  metricsEnabled = true;
} catch (_error) {
  console.warn("[PrometheusMetrics] prom-client not installed, metrics disabled");
}

export class PrometheusMetrics {
  private static instance: PrometheusMetrics;

  // MCP Server Metrics
  public readonly toolExecutionDuration: any;
  public readonly toolExecutionTotal: any;
  public readonly toolExecutionErrors: any;
  public readonly activeConnections: any;
  public readonly requestsPerSecond: any;

  // Circuit Breaker Metrics
  public readonly circuitBreakerState: any;
  public readonly circuitBreakerTrips: any;
  public readonly circuitBreakerRecoveries: any;

  // Connection Pool Metrics
  public readonly connectionPoolSize: any;
  public readonly connectionPoolActive: any;
  public readonly connectionPoolHealth: any;
  public readonly connectionPoolResponseTime: any;

  // Cache Metrics
  public readonly cacheHitRatio: any;
  public readonly cacheSize: any;
  public readonly cacheEvictions: any;
  public readonly cacheOperations: any;

  // Elasticsearch Metrics
  public readonly elasticsearchResponseTime: any;
  public readonly elasticsearchErrors: any;
  public readonly elasticsearchIndexOperations: any;
  public readonly elasticsearchSearchOperations: any;

  // Security Metrics
  public readonly securityValidationFailures: any;
  public readonly readOnlyModeBlocks: any;
  public readonly rateLimitHits: any;

  // System Metrics
  public readonly memoryUsage: any;
  public readonly cpuUsage: any;

  private constructor() {
    if (!metricsEnabled || !promClient) {
      return;
    }

    // Configure default metrics
    promClient.collectDefaultMetrics({
      prefix: "elasticsearch_mcp_",
      timeout: 5000,
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    });

    // Tool Execution Metrics
    this.toolExecutionDuration = new promClient.Histogram({
      name: "elasticsearch_mcp_tool_execution_duration_seconds",
      help: "Duration of tool execution in seconds",
      labelNames: ["tool_name", "tool_category", "status"],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    this.toolExecutionTotal = new promClient.Counter({
      name: "elasticsearch_mcp_tool_execution_total",
      help: "Total number of tool executions",
      labelNames: ["tool_name", "tool_category", "status"],
    });

    this.toolExecutionErrors = new promClient.Counter({
      name: "elasticsearch_mcp_tool_execution_errors_total",
      help: "Total number of tool execution errors",
      labelNames: ["tool_name", "tool_category", "error_type"],
    });

    this.activeConnections = new promClient.Gauge({
      name: "elasticsearch_mcp_active_connections",
      help: "Number of active MCP connections",
    });

    this.requestsPerSecond = new promClient.Gauge({
      name: "elasticsearch_mcp_requests_per_second",
      help: "Current requests per second",
    });

    // Circuit Breaker Metrics
    this.circuitBreakerState = new promClient.Gauge({
      name: "elasticsearch_mcp_circuit_breaker_state",
      help: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
      labelNames: ["operation"],
    });

    this.circuitBreakerTrips = new promClient.Counter({
      name: "elasticsearch_mcp_circuit_breaker_trips_total",
      help: "Total number of circuit breaker trips",
      labelNames: ["operation"],
    });

    this.circuitBreakerRecoveries = new promClient.Counter({
      name: "elasticsearch_mcp_circuit_breaker_recoveries_total",
      help: "Total number of circuit breaker recoveries",
      labelNames: ["operation"],
    });

    // Connection Pool Metrics
    this.connectionPoolSize = new promClient.Gauge({
      name: "elasticsearch_mcp_connection_pool_size",
      help: "Total size of connection pool",
    });

    this.connectionPoolActive = new promClient.Gauge({
      name: "elasticsearch_mcp_connection_pool_active",
      help: "Number of active connections in pool",
    });

    this.connectionPoolHealth = new promClient.Gauge({
      name: "elasticsearch_mcp_connection_pool_health_ratio",
      help: "Ratio of healthy connections in pool",
    });

    this.connectionPoolResponseTime = new promClient.Histogram({
      name: "elasticsearch_mcp_connection_pool_response_time_seconds",
      help: "Connection pool response time",
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
    });

    // Cache Metrics
    this.cacheHitRatio = new promClient.Gauge({
      name: "elasticsearch_mcp_cache_hit_ratio",
      help: "Cache hit ratio",
      labelNames: ["cache_type"],
    });

    this.cacheSize = new promClient.Gauge({
      name: "elasticsearch_mcp_cache_size",
      help: "Current cache size",
      labelNames: ["cache_type"],
    });

    this.cacheEvictions = new promClient.Counter({
      name: "elasticsearch_mcp_cache_evictions_total",
      help: "Total number of cache evictions",
      labelNames: ["cache_type"],
    });

    this.cacheOperations = new promClient.Counter({
      name: "elasticsearch_mcp_cache_operations_total",
      help: "Total cache operations",
      labelNames: ["cache_type", "operation"],
    });

    // Elasticsearch Metrics
    this.elasticsearchResponseTime = new promClient.Histogram({
      name: "elasticsearch_mcp_es_response_time_seconds",
      help: "Elasticsearch response time",
      labelNames: ["operation", "index"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    });

    this.elasticsearchErrors = new promClient.Counter({
      name: "elasticsearch_mcp_es_errors_total",
      help: "Total Elasticsearch errors",
      labelNames: ["operation", "error_code"],
    });

    this.elasticsearchIndexOperations = new promClient.Counter({
      name: "elasticsearch_mcp_es_index_operations_total",
      help: "Total Elasticsearch index operations",
      labelNames: ["operation", "index"],
    });

    this.elasticsearchSearchOperations = new promClient.Counter({
      name: "elasticsearch_mcp_es_search_operations_total",
      help: "Total Elasticsearch search operations",
      labelNames: ["index", "query_type"],
    });

    // Security Metrics
    this.securityValidationFailures = new promClient.Counter({
      name: "elasticsearch_mcp_security_validation_failures_total",
      help: "Total security validation failures",
      labelNames: ["tool_name", "failure_type"],
    });

    this.readOnlyModeBlocks = new promClient.Counter({
      name: "elasticsearch_mcp_readonly_mode_blocks_total",
      help: "Total operations blocked by read-only mode",
      labelNames: ["tool_name", "operation_type"],
    });

    this.rateLimitHits = new promClient.Counter({
      name: "elasticsearch_mcp_rate_limit_hits_total",
      help: "Total rate limit hits",
      labelNames: ["limit_type"],
    });

    // System Metrics
    this.memoryUsage = new promClient.Gauge({
      name: "elasticsearch_mcp_memory_usage_bytes",
      help: "Memory usage in bytes",
      labelNames: ["type"],
    });

    this.cpuUsage = new promClient.Gauge({
      name: "elasticsearch_mcp_cpu_usage_percent",
      help: "CPU usage percentage",
    });

    // Start system metrics collection
    this.startSystemMetricsCollection();
  }

  public static getInstance(): PrometheusMetrics {
    if (!PrometheusMetrics.instance) {
      PrometheusMetrics.instance = new PrometheusMetrics();
    }
    return PrometheusMetrics.instance;
  }

  public isEnabled(): boolean {
    return metricsEnabled && promClient !== null;
  }

  public recordToolExecution(
    toolName: string,
    category: string,
    _duration: number,
    status: "success" | "error" | "timeout",
  ): void {
    if (!this.isEnabled()) return;

    const endTimer = this.toolExecutionDuration.startTimer({
      tool_name: toolName,
      tool_category: category,
      status,
    });
    endTimer();

    this.toolExecutionTotal.inc({
      tool_name: toolName,
      tool_category: category,
      status,
    });
  }

  public recordToolError(toolName: string, category: string, errorType: string): void {
    if (!this.isEnabled()) return;

    this.toolExecutionErrors.inc({
      tool_name: toolName,
      tool_category: category,
      error_type: errorType,
    });
  }

  public recordCircuitBreakerState(operation: string, state: "closed" | "open" | "half-open"): void {
    if (!this.isEnabled()) return;

    const stateValue = state === "closed" ? 0 : state === "open" ? 1 : 2;
    this.circuitBreakerState.set({ operation }, stateValue);
  }

  public recordCircuitBreakerTrip(operation: string): void {
    if (!this.isEnabled()) return;
    this.circuitBreakerTrips.inc({ operation });
  }

  public recordCircuitBreakerRecovery(operation: string): void {
    if (!this.isEnabled()) return;
    this.circuitBreakerRecoveries.inc({ operation });
  }

  public updateConnectionPoolMetrics(totalSize: number, activeConnections: number, healthyRatio: number): void {
    if (!this.isEnabled()) return;

    this.connectionPoolSize.set(totalSize);
    this.connectionPoolActive.set(activeConnections);
    this.connectionPoolHealth.set(healthyRatio);
  }

  public recordConnectionPoolResponseTime(duration: number): void {
    if (!this.isEnabled()) return;
    this.connectionPoolResponseTime.observe(duration);
  }

  public updateCacheMetrics(cacheType: string, size: number, hitRatio: number): void {
    if (!this.isEnabled()) return;

    this.cacheSize.set({ cache_type: cacheType }, size);
    this.cacheHitRatio.set({ cache_type: cacheType }, hitRatio);
  }

  public recordCacheOperation(cacheType: string, operation: "hit" | "miss" | "eviction" | "clear"): void {
    if (!this.isEnabled()) return;

    this.cacheOperations.inc({ cache_type: cacheType, operation });

    if (operation === "eviction") {
      this.cacheEvictions.inc({ cache_type: cacheType });
    }
  }

  public recordElasticsearchOperation(
    operation: string,
    index: string,
    duration: number,
    success: boolean,
    errorCode?: string,
  ): void {
    if (!this.isEnabled()) return;

    this.elasticsearchResponseTime.observe({ operation, index }, duration);

    if (success) {
      this.elasticsearchIndexOperations.inc({ operation, index });
    } else if (errorCode) {
      this.elasticsearchErrors.inc({ operation, error_code: errorCode });
    }
  }

  public recordSearchOperation(index: string, queryType: string): void {
    if (!this.isEnabled()) return;
    this.elasticsearchSearchOperations.inc({ index, query_type: queryType });
  }

  public recordSecurityValidationFailure(toolName: string, failureType: string): void {
    if (!this.isEnabled()) return;
    this.securityValidationFailures.inc({ tool_name: toolName, failure_type: failureType });
  }

  public recordReadOnlyModeBlock(toolName: string, operationType: string): void {
    if (!this.isEnabled()) return;
    this.readOnlyModeBlocks.inc({ tool_name: toolName, operation_type: operationType });
  }

  public recordRateLimitHit(limitType: string): void {
    if (!this.isEnabled()) return;
    this.rateLimitHits.inc({ limit_type: limitType });
  }

  public setActiveConnections(count: number): void {
    if (!this.isEnabled()) return;
    this.activeConnections.set(count);
  }

  public setRequestsPerSecond(rps: number): void {
    if (!this.isEnabled()) return;
    this.requestsPerSecond.set(rps);
  }

  // Enhanced Elasticsearch transport metrics
  public recordElasticsearchMetrics(metrics: {
    averageResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    activeConnections: number;
  }): void {
    if (!this.isEnabled()) return;

    this.elasticsearchResponseTime.observe({ operation: 'transport', index: '*' }, metrics.averageResponseTime / 1000);
    this.setRequestsPerSecond(metrics.requestsPerSecond);
    this.setActiveConnections(metrics.activeConnections);
    
    // Record error rate as a gauge if needed
    if (this.elasticsearchErrors) {
      // Note: Error rate is tracked via individual error recordings
    }
  }

  public getMetrics(): string {
    if (!this.isEnabled()) return "";
    return promClient.register.metrics();
  }

  public clearMetrics(): void {
    if (!this.isEnabled()) return;
    promClient.register.clear();
  }

  private startSystemMetricsCollection(): void {
    if (!this.isEnabled()) return;

    // Collect system metrics every 10 seconds
    setInterval(() => {
      try {
        const memUsage = process.memoryUsage();
        this.memoryUsage.set({ type: "rss" }, memUsage.rss);
        this.memoryUsage.set({ type: "heapUsed" }, memUsage.heapUsed);
        this.memoryUsage.set({ type: "heapTotal" }, memUsage.heapTotal);
        this.memoryUsage.set({ type: "external" }, memUsage.external);

        // CPU usage (simplified - would need more sophisticated tracking in production)
        if (typeof process.cpuUsage === "function") {
          const cpuUsage = process.cpuUsage();
          const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
          this.cpuUsage.set(totalUsage);
        }
      } catch (error) {
        console.warn("[PrometheusMetrics] Error collecting system metrics:", error);
      }
    }, 10000);
  }
}

export const metrics = PrometheusMetrics.getInstance();
