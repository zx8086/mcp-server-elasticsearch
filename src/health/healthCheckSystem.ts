import { EventEmitter } from "node:events";
import type { Client } from "@elastic/elasticsearch";
import { metrics } from "../monitoring/prometheusMetrics.js";
import { logger } from "../utils/logger.js";

export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNHEALTHY = "unhealthy",
  CRITICAL = "critical",
  UNKNOWN = "unknown",
}

export enum HealthCheckType {
  DEEP = "deep",
  SHALLOW = "shallow",
  CRITICAL_ONLY = "critical_only",
}

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  duration: number;
  timestamp: string;
  message?: string;
  details?: any;
  metrics?: { [key: string]: number };
  dependencies?: string[];
  recommendations?: string[];
}

export interface SystemHealthSnapshot {
  overall: HealthStatus;
  timestamp: string;
  duration: number;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    critical: number;
  };
  alerts: HealthAlert[];
  trends: {
    status: HealthStatus;
    direction: "improving" | "stable" | "degrading";
    confidence: number;
  };
}

export interface HealthAlert {
  id: string;
  level: "info" | "warning" | "error" | "critical";
  message: string;
  component: string;
  timestamp: string;
  resolved?: boolean;
  details?: any;
}

interface HealthCheckConfig {
  enabled: boolean;
  interval: number;
  timeout: number;
  retries: number;
  criticality: "low" | "medium" | "high" | "critical";
  dependencies?: string[];
}

abstract class BaseHealthCheck {
  public readonly name: string;
  protected config: HealthCheckConfig;

  constructor(name: string, config: Partial<HealthCheckConfig> = {}) {
    this.name = name;
    this.config = {
      enabled: true,
      interval: 30000, // 30 seconds
      timeout: 5000, // 5 seconds
      retries: 2,
      criticality: "medium",
      ...config,
    };
  }

  public abstract execute(): Promise<HealthCheckResult>;

  protected createResult(status: HealthStatus, duration: number, message?: string, details?: any): HealthCheckResult {
    return {
      name: this.name,
      status,
      duration,
      timestamp: new Date().toISOString(),
      message,
      details,
      dependencies: this.config.dependencies,
    };
  }

  public getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }
}

class ElasticsearchConnectionCheck extends BaseHealthCheck {
  private client: Client;

  constructor(client: Client) {
    super("elasticsearch_connection", {
      criticality: "critical",
      timeout: 10000,
    });
    this.client = client;
  }

  public async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const response = await this.client.ping({ requestTimeout: this.config.timeout });
      const duration = performance.now() - startTime;

      return this.createResult(HealthStatus.HEALTHY, duration, "Elasticsearch connection is healthy", {
        response: response.body,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      return this.createResult(HealthStatus.CRITICAL, duration, `Elasticsearch connection failed: ${error.message}`, {
        error: error.message,
      });
    }
  }
}

class ElasticsearchClusterHealthCheck extends BaseHealthCheck {
  private client: Client;

  constructor(client: Client) {
    super("elasticsearch_cluster_health", {
      criticality: "critical",
      dependencies: ["elasticsearch_connection"],
    });
    this.client = client;
  }

  public async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const response = await this.client.cluster.health({
        timeout: `${this.config.timeout}ms`,
      });
      const duration = performance.now() - startTime;
      const health = response.body;

      let status: HealthStatus;
      let message: string;
      const recommendations: string[] = [];

      switch (health.status) {
        case "green":
          status = HealthStatus.HEALTHY;
          message = "Cluster is healthy (green)";
          break;
        case "yellow":
          status = HealthStatus.DEGRADED;
          message = `Cluster is degraded (yellow) - ${health.unassigned_shards} unassigned shards`;
          recommendations.push("Review unassigned shards and replica settings");
          break;
        case "red":
          status = HealthStatus.UNHEALTHY;
          message = `Cluster is unhealthy (red) - ${health.unassigned_shards} unassigned shards`;
          recommendations.push("Immediate attention required - cluster has missing primary shards");
          break;
        default:
          status = HealthStatus.UNKNOWN;
          message = `Unknown cluster status: ${health.status}`;
      }

      // Additional health indicators
      if (health.active_shards_percent_as_number < 100) {
        recommendations.push(
          `Active shards: ${health.active_shards_percent_as_number}% - investigate shard allocation`,
        );
      }

      if (health.delayed_unassigned_shards > 0) {
        recommendations.push(`${health.delayed_unassigned_shards} delayed unassigned shards detected`);
      }

      return {
        ...this.createResult(status, duration, message),
        metrics: {
          active_shards: health.active_shards,
          active_primary_shards: health.active_primary_shards,
          relocating_shards: health.relocating_shards,
          initializing_shards: health.initializing_shards,
          unassigned_shards: health.unassigned_shards,
          delayed_unassigned_shards: health.delayed_unassigned_shards,
          number_of_pending_tasks: health.number_of_pending_tasks,
          number_of_in_flight_fetch: health.number_of_in_flight_fetch,
          task_max_waiting_in_queue_millis: health.task_max_waiting_in_queue_millis,
          active_shards_percent: health.active_shards_percent_as_number,
        },
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        details: health,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return this.createResult(HealthStatus.CRITICAL, duration, `Cluster health check failed: ${error.message}`, {
        error: error.message,
      });
    }
  }
}

class CircuitBreakerHealthCheck extends BaseHealthCheck {
  private circuitBreakerStates: Map<string, any>;

  constructor(circuitBreakerStates: Map<string, any>) {
    super("circuit_breakers", {
      criticality: "high",
    });
    this.circuitBreakerStates = circuitBreakerStates;
  }

  public async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const openBreakers: string[] = [];
      const halfOpenBreakers: string[] = [];
      const totalBreakers = this.circuitBreakerStates.size;
      const breakerMetrics: { [key: string]: number } = {};

      for (const [operation, breaker] of this.circuitBreakerStates) {
        const state = breaker.getState();
        breakerMetrics[`${operation}_state`] = state === "CLOSED" ? 0 : state === "OPEN" ? 1 : 2;
        breakerMetrics[`${operation}_failures`] = breaker.getFailureCount();

        if (state === "OPEN") {
          openBreakers.push(operation);
        } else if (state === "HALF_OPEN") {
          halfOpenBreakers.push(operation);
        }
      }

      const duration = performance.now() - startTime;

      let status: HealthStatus;
      let message: string;
      const recommendations: string[] = [];

      if (openBreakers.length > 0) {
        status = HealthStatus.UNHEALTHY;
        message = `${openBreakers.length} circuit breakers are OPEN: ${openBreakers.join(", ")}`;
        recommendations.push("Investigate underlying service failures causing circuit breaker trips");
        recommendations.push("Check Elasticsearch cluster health and network connectivity");
      } else if (halfOpenBreakers.length > 0) {
        status = HealthStatus.DEGRADED;
        message = `${halfOpenBreakers.length} circuit breakers are HALF-OPEN: ${halfOpenBreakers.join(", ")}`;
        recommendations.push("Monitor circuit breakers recovering from failures");
      } else {
        status = HealthStatus.HEALTHY;
        message = `All ${totalBreakers} circuit breakers are CLOSED`;
      }

      return {
        ...this.createResult(status, duration, message),
        metrics: breakerMetrics,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        details: {
          totalBreakers,
          openBreakers: openBreakers.length,
          halfOpenBreakers: halfOpenBreakers.length,
          closedBreakers: totalBreakers - openBreakers.length - halfOpenBreakers.length,
          breakerDetails: openBreakers.concat(halfOpenBreakers),
        },
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return this.createResult(
        HealthStatus.UNKNOWN,
        duration,
        `Circuit breaker health check failed: ${error.message}`,
        { error: error.message },
      );
    }
  }
}

class ConnectionPoolHealthCheck extends BaseHealthCheck {
  private connectionPool: any;

  constructor(connectionPool: any) {
    super("connection_pool", {
      criticality: "high",
      dependencies: ["elasticsearch_connection"],
    });
    this.connectionPool = connectionPool;
  }

  public async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const stats = this.connectionPool.getStats();
      const duration = performance.now() - startTime;

      let status: HealthStatus;
      let message: string;
      const recommendations: string[] = [];

      const healthyRatio = stats.healthyConnections / stats.totalConnections;
      const utilizationRatio = stats.activeConnections / stats.totalConnections;

      if (healthyRatio < 0.5) {
        status = HealthStatus.UNHEALTHY;
        message = `Connection pool unhealthy: ${(healthyRatio * 100).toFixed(1)}% healthy connections`;
        recommendations.push("Investigate connection failures to Elasticsearch");
        recommendations.push("Consider increasing connection pool size or timeout settings");
      } else if (healthyRatio < 0.8) {
        status = HealthStatus.DEGRADED;
        message = `Connection pool degraded: ${(healthyRatio * 100).toFixed(1)}% healthy connections`;
        recommendations.push("Monitor connection health and consider pool tuning");
      } else if (utilizationRatio > 0.9) {
        status = HealthStatus.DEGRADED;
        message = `High connection pool utilization: ${(utilizationRatio * 100).toFixed(1)}%`;
        recommendations.push("Consider increasing connection pool size to handle load");
      } else {
        status = HealthStatus.HEALTHY;
        message = `Connection pool healthy: ${stats.healthyConnections}/${stats.totalConnections} connections`;
      }

      return {
        ...this.createResult(status, duration, message),
        metrics: {
          total_connections: stats.totalConnections,
          active_connections: stats.activeConnections,
          healthy_connections: stats.healthyConnections,
          average_response_time: stats.averageResponseTime,
          health_ratio: healthyRatio,
          utilization_ratio: utilizationRatio,
        },
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        details: stats,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return this.createResult(
        HealthStatus.UNKNOWN,
        duration,
        `Connection pool health check failed: ${error.message}`,
        { error: error.message },
      );
    }
  }
}

class CacheHealthCheck extends BaseHealthCheck {
  private caches: Map<string, any>;

  constructor(caches: Map<string, any>) {
    super("cache_systems", {
      criticality: "medium",
    });
    this.caches = caches;
  }

  public async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const cacheMetrics: { [key: string]: number } = {};
      const lowPerformanceCaches: string[] = [];
      let totalHitRatio = 0;
      let totalCaches = 0;

      for (const [cacheName, cache] of this.caches) {
        const stats = cache.getStats();
        const hitRatio = stats.hitRatio || 0;

        cacheMetrics[`${cacheName}_size`] = stats.size || 0;
        cacheMetrics[`${cacheName}_hit_ratio`] = hitRatio;
        cacheMetrics[`${cacheName}_evictions`] = stats.evictions || 0;

        totalHitRatio += hitRatio;
        totalCaches++;

        if (hitRatio < 0.6) {
          lowPerformanceCaches.push(cacheName);
        }
      }

      const duration = performance.now() - startTime;
      const averageHitRatio = totalCaches > 0 ? totalHitRatio / totalCaches : 1;

      let status: HealthStatus;
      let message: string;
      const recommendations: string[] = [];

      if (averageHitRatio < 0.5) {
        status = HealthStatus.DEGRADED;
        message = `Cache performance degraded: ${(averageHitRatio * 100).toFixed(1)}% average hit ratio`;
        recommendations.push("Review cache configuration and TTL settings");
        recommendations.push("Consider increasing cache size or optimizing cache keys");
      } else if (lowPerformanceCaches.length > 0) {
        status = HealthStatus.DEGRADED;
        message = `Some caches underperforming: ${lowPerformanceCaches.join(", ")}`;
        recommendations.push(`Optimize underperforming caches: ${lowPerformanceCaches.join(", ")}`);
      } else {
        status = HealthStatus.HEALTHY;
        message = `Cache systems healthy: ${(averageHitRatio * 100).toFixed(1)}% average hit ratio`;
      }

      return {
        ...this.createResult(status, duration, message),
        metrics: {
          ...cacheMetrics,
          average_hit_ratio: averageHitRatio,
          total_caches: totalCaches,
        },
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        details: {
          totalCaches,
          averageHitRatio,
          lowPerformanceCaches,
        },
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return this.createResult(HealthStatus.UNKNOWN, duration, `Cache health check failed: ${error.message}`, {
        error: error.message,
      });
    }
  }
}

class MemoryHealthCheck extends BaseHealthCheck {
  constructor() {
    super("memory_usage", {
      criticality: "high",
    });
  }

  public async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const memUsage = process.memoryUsage();
      const duration = performance.now() - startTime;

      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const rssMB = memUsage.rss / 1024 / 1024;
      const heapUtilization = memUsage.heapUsed / memUsage.heapTotal;

      let status: HealthStatus;
      let message: string;
      const recommendations: string[] = [];

      if (heapUtilization > 0.9) {
        status = HealthStatus.CRITICAL;
        message = `Critical memory usage: ${(heapUtilization * 100).toFixed(1)}% heap utilization`;
        recommendations.push("Immediate attention required - high memory pressure");
        recommendations.push("Consider restarting the service or increasing memory allocation");
      } else if (heapUtilization > 0.8) {
        status = HealthStatus.UNHEALTHY;
        message = `High memory usage: ${(heapUtilization * 100).toFixed(1)}% heap utilization`;
        recommendations.push("Monitor memory usage closely");
        recommendations.push("Consider memory optimization or scaling up");
      } else if (heapUtilization > 0.7) {
        status = HealthStatus.DEGRADED;
        message = `Elevated memory usage: ${(heapUtilization * 100).toFixed(1)}% heap utilization`;
        recommendations.push("Monitor memory trends and consider proactive scaling");
      } else {
        status = HealthStatus.HEALTHY;
        message = `Memory usage healthy: ${heapUsedMB.toFixed(1)}MB used (${(heapUtilization * 100).toFixed(1)}%)`;
      }

      return {
        ...this.createResult(status, duration, message),
        metrics: {
          heap_used_mb: heapUsedMB,
          heap_total_mb: heapTotalMB,
          rss_mb: rssMB,
          external_mb: memUsage.external / 1024 / 1024,
          heap_utilization: heapUtilization,
        },
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        details: memUsage,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      return this.createResult(HealthStatus.UNKNOWN, duration, `Memory health check failed: ${error.message}`, {
        error: error.message,
      });
    }
  }
}

export class HealthCheckSystem extends EventEmitter {
  private healthChecks: Map<string, BaseHealthCheck> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();
  private healthHistory: SystemHealthSnapshot[] = [];
  private activeAlerts: Map<string, HealthAlert> = new Map();
  private checkInterval: Timer | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  public registerHealthCheck(healthCheck: BaseHealthCheck): void {
    this.healthChecks.set(healthCheck.name, healthCheck);
    logger.info(`Health check registered: ${healthCheck.name}`);
  }

  public async runHealthChecks(type: HealthCheckType = HealthCheckType.SHALLOW): Promise<SystemHealthSnapshot> {
    const startTime = performance.now();
    const results: HealthCheckResult[] = [];
    const alerts: HealthAlert[] = [];

    logger.info(`Running health checks (type: ${type})`);

    // Run health checks in parallel
    const checkPromises = Array.from(this.healthChecks.values())
      .filter((check) => check.isEnabled())
      .filter((check) => this.shouldRunCheck(check, type))
      .map(async (check) => {
        try {
          const result = await this.executeHealthCheckWithTimeout(check);
          this.lastResults.set(check.name, result);

          // Generate alerts for unhealthy checks
          if (result.status !== HealthStatus.HEALTHY) {
            const alert = this.generateAlert(result);
            alerts.push(alert);
          }

          return result;
        } catch (error) {
          logger.error(`Health check failed: ${check.name}`, { error });
          const failureResult: HealthCheckResult = {
            name: check.name,
            status: HealthStatus.UNKNOWN,
            duration: 0,
            timestamp: new Date().toISOString(),
            message: `Health check execution failed: ${error.message}`,
            details: { error: error.message },
          };
          return failureResult;
        }
      });

    results.push(...(await Promise.all(checkPromises)));

    const duration = performance.now() - startTime;
    const summary = this.calculateSummary(results);
    const overall = this.determineOverallHealth(results);
    const trends = this.analyzeTrends();

    const snapshot: SystemHealthSnapshot = {
      overall,
      timestamp: new Date().toISOString(),
      duration,
      checks: results,
      summary,
      alerts,
      trends,
    };

    // Update history
    this.updateHealthHistory(snapshot);

    // Emit health change events
    this.emitHealthEvents(snapshot);

    // Update metrics
    this.updateMetrics(snapshot);

    return snapshot;
  }

  public startPeriodicHealthChecks(interval = 30000): void {
    if (this.isRunning) {
      this.stopPeriodicHealthChecks();
    }

    this.checkInterval = setInterval(async () => {
      try {
        await this.runHealthChecks(HealthCheckType.SHALLOW);
      } catch (error) {
        logger.error("Periodic health check failed", { error });
      }
    }, interval);

    this.isRunning = true;
    logger.info(`Periodic health checks started (interval: ${interval}ms)`);
  }

  public stopPeriodicHealthChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info("Periodic health checks stopped");
  }

  public getHealthStatus(): SystemHealthSnapshot | null {
    if (this.healthHistory.length === 0) {
      return null;
    }
    return this.healthHistory[this.healthHistory.length - 1];
  }

  public getHealthHistory(limit = 100): SystemHealthSnapshot[] {
    return this.healthHistory.slice(-limit);
  }

  public getActiveAlerts(): HealthAlert[] {
    return Array.from(this.activeAlerts.values()).filter((alert) => !alert.resolved);
  }

  private shouldRunCheck(check: BaseHealthCheck, type: HealthCheckType): boolean {
    const config = check.getConfig();

    switch (type) {
      case HealthCheckType.CRITICAL_ONLY:
        return config.criticality === "critical";
      case HealthCheckType.SHALLOW:
        return config.criticality === "critical" || config.criticality === "high";
      case HealthCheckType.DEEP:
        return true;
      default:
        return true;
    }
  }

  private async executeHealthCheckWithTimeout(check: BaseHealthCheck): Promise<HealthCheckResult> {
    const config = check.getConfig();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Health check timeout after ${config.timeout}ms`));
      }, config.timeout);

      check
        .execute()
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private calculateSummary(results: HealthCheckResult[]) {
    const summary = {
      total: results.length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      critical: 0,
    };

    for (const result of results) {
      switch (result.status) {
        case HealthStatus.HEALTHY:
          summary.healthy++;
          break;
        case HealthStatus.DEGRADED:
          summary.degraded++;
          break;
        case HealthStatus.UNHEALTHY:
          summary.unhealthy++;
          break;
        case HealthStatus.CRITICAL:
          summary.critical++;
          break;
      }
    }

    return summary;
  }

  private determineOverallHealth(results: HealthCheckResult[]): HealthStatus {
    if (results.length === 0) {
      return HealthStatus.UNKNOWN;
    }

    const hasCritical = results.some((r) => r.status === HealthStatus.CRITICAL);
    const hasUnhealthy = results.some((r) => r.status === HealthStatus.UNHEALTHY);
    const hasDegraded = results.some((r) => r.status === HealthStatus.DEGRADED);

    if (hasCritical) {
      return HealthStatus.CRITICAL;
    }
    if (hasUnhealthy) {
      return HealthStatus.UNHEALTHY;
    }
    if (hasDegraded) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  private analyzeTrends(): {
    status: HealthStatus;
    direction: "improving" | "stable" | "degrading";
    confidence: number;
  } {
    if (this.healthHistory.length < 3) {
      return {
        status: HealthStatus.UNKNOWN,
        direction: "stable",
        confidence: 0,
      };
    }

    const recent = this.healthHistory.slice(-5);
    const statusValues = recent.map((h) => this.statusToNumber(h.overall));

    // Calculate trend direction
    const trend = this.calculateTrend(statusValues);
    let direction: "improving" | "stable" | "degrading";

    if (trend > 0.1) {
      direction = "improving";
    } else if (trend < -0.1) {
      direction = "degrading";
    } else {
      direction = "stable";
    }

    return {
      status: recent[recent.length - 1].overall,
      direction,
      confidence: Math.min(Math.abs(trend), 1),
    };
  }

  private statusToNumber(status: HealthStatus): number {
    switch (status) {
      case HealthStatus.CRITICAL:
        return 0;
      case HealthStatus.UNHEALTHY:
        return 1;
      case HealthStatus.DEGRADED:
        return 2;
      case HealthStatus.HEALTHY:
        return 3;
      default:
        return 1.5;
    }
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private generateAlert(result: HealthCheckResult): HealthAlert {
    let level: HealthAlert["level"];
    switch (result.status) {
      case HealthStatus.CRITICAL:
        level = "critical";
        break;
      case HealthStatus.UNHEALTHY:
        level = "error";
        break;
      case HealthStatus.DEGRADED:
        level = "warning";
        break;
      default:
        level = "info";
    }

    const alert: HealthAlert = {
      id: `${result.name}_${Date.now()}`,
      level,
      message: result.message || `${result.name} is ${result.status}`,
      component: result.name,
      timestamp: result.timestamp,
      details: result.details,
    };

    this.activeAlerts.set(alert.id, alert);
    return alert;
  }

  private updateHealthHistory(snapshot: SystemHealthSnapshot): void {
    this.healthHistory.push(snapshot);

    // Keep only last 1000 snapshots
    if (this.healthHistory.length > 1000) {
      this.healthHistory = this.healthHistory.slice(-1000);
    }
  }

  private emitHealthEvents(snapshot: SystemHealthSnapshot): void {
    this.emit("health_check_complete", snapshot);

    if (snapshot.overall !== HealthStatus.HEALTHY) {
      this.emit("health_degraded", snapshot);
    }

    if (snapshot.alerts.length > 0) {
      this.emit("health_alerts", snapshot.alerts);
    }
  }

  private updateMetrics(snapshot: SystemHealthSnapshot): void {
    if (!metrics.isEnabled()) {
      return;
    }

    // Update overall health metric (0=healthy, 1=degraded, 2=unhealthy, 3=critical)
    let _healthValue: number;
    switch (snapshot.overall) {
      case HealthStatus.HEALTHY:
        _healthValue = 0;
        break;
      case HealthStatus.DEGRADED:
        _healthValue = 1;
        break;
      case HealthStatus.UNHEALTHY:
        _healthValue = 2;
        break;
      case HealthStatus.CRITICAL:
        _healthValue = 3;
        break;
      default:
        _healthValue = -1;
    }

    // Note: You'd need to add these metrics to the PrometheusMetrics class
    // metrics.setOverallHealth(healthValue);
    // metrics.setHealthCheckDuration(snapshot.duration);
  }

  private setupEventHandlers(): void {
    this.on("health_degraded", (snapshot: SystemHealthSnapshot) => {
      logger.warn("System health degraded", {
        overall: snapshot.overall,
        unhealthyChecks: snapshot.checks.filter((c) => c.status !== HealthStatus.HEALTHY).map((c) => c.name),
      });
    });

    this.on("health_alerts", (alerts: HealthAlert[]) => {
      for (const alert of alerts) {
        logger.warn("Health alert generated", alert);
      }
    });
  }

  public destroy(): void {
    this.stopPeriodicHealthChecks();
    this.removeAllListeners();
    this.healthChecks.clear();
    this.lastResults.clear();
    this.healthHistory = [];
    this.activeAlerts.clear();

    logger.info("Health check system destroyed");
  }
}

// Factory function to create a fully configured health check system
export function createHealthCheckSystem(
  esClient: Client,
  circuitBreakers: Map<string, any>,
  connectionPool: any,
  caches: Map<string, any>,
): HealthCheckSystem {
  const healthSystem = new HealthCheckSystem();

  // Register all health checks
  healthSystem.registerHealthCheck(new ElasticsearchConnectionCheck(esClient));
  healthSystem.registerHealthCheck(new ElasticsearchClusterHealthCheck(esClient));
  healthSystem.registerHealthCheck(new CircuitBreakerHealthCheck(circuitBreakers));
  healthSystem.registerHealthCheck(new ConnectionPoolHealthCheck(connectionPool));
  healthSystem.registerHealthCheck(new CacheHealthCheck(caches));
  healthSystem.registerHealthCheck(new MemoryHealthCheck());

  return healthSystem;
}
