/* src/utils/healthCheck.ts */

import type { Client } from "@elastic/elasticsearch";
import { getAllCacheStats } from "./cache.js";
import { getAllCircuitBreakerStats } from "./circuitBreaker.js";
import { getGlobalConnectionPool } from "./connectionPooling.js";
import { getConnectionWarmingStats } from "./connectionWarming.js";
import { logger } from "./logger.js";
import { getResourceMonitor } from "./rateLimiter.js";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  elasticsearch: {
    status: "healthy" | "degraded" | "unhealthy";
    clusterName?: string;
    version?: string;
    responseTime?: number;
    error?: string;
  };
  connectionPool: {
    status: "healthy" | "degraded" | "unhealthy";
    activeConnections: number;
    failedConnections: number;
    totalConnections: number;
  };
  server: {
    status: "healthy";
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    version: string;
  };
  caching?: {
    status: "healthy" | "degraded" | "unhealthy";
    stats: any;
  };
  connectionWarming?: {
    status: "healthy" | "degraded" | "unhealthy";
    stats: any;
  };
  circuitBreakers?: {
    status: "healthy" | "degraded" | "unhealthy";
    stats: any;
  };
  resourceMonitoring?: {
    status: "healthy" | "degraded" | "unhealthy";
    stats: any;
  };
}

export class HealthMonitor {
  private startTime = Date.now();
  private lastHealthCheck?: HealthStatus;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private client: Client,
    private intervalMs = 30000,
  ) {}

  start(): void {
    if (this.healthCheckInterval) {
      return; // Already started
    }

    // Perform initial health check
    this.performHealthCheck().catch((error) => {
      logger.warn("Initial health check failed", { error: error.message });
    });

    // Set up periodic health checks
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error("Periodic health check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.intervalMs);

    logger.info("Health monitoring started", { intervalMs: this.intervalMs });
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      logger.info("Health monitoring stopped");
    }
  }

  async getHealthStatus(): Promise<HealthStatus> {
    if (!this.lastHealthCheck || Date.now() - new Date(this.lastHealthCheck.timestamp).getTime() > 60000) {
      // Refresh if older than 1 minute
      await this.performHealthCheck();
    }
    return this.lastHealthCheck!;
  }

  getLastHealthStatus(): HealthStatus | undefined {
    return this.lastHealthCheck;
  }

  private async performHealthCheck(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();

    // Check Elasticsearch health
    const esHealth = await this.checkElasticsearchHealth();

    // Check connection pool health
    const poolHealth = this.checkConnectionPoolHealth();

    // Check server health
    const serverHealth = this.checkServerHealth();

    // Check performance systems health
    const cachingHealth = this.checkCachingHealth();
    const connectionWarmingHealth = this.checkConnectionWarmingHealth();
    const circuitBreakersHealth = this.checkCircuitBreakersHealth();
    const resourceMonitoringHealth = this.checkResourceMonitoringHealth();

    // Determine overall status
    const overallStatus = this.determineOverallStatus(
      esHealth,
      poolHealth,
      serverHealth,
      cachingHealth,
      connectionWarmingHealth,
      circuitBreakersHealth,
      resourceMonitoringHealth,
    );

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp,
      elasticsearch: esHealth,
      connectionPool: poolHealth,
      server: serverHealth,
      caching: cachingHealth,
      connectionWarming: connectionWarmingHealth,
      circuitBreakers: circuitBreakersHealth,
      resourceMonitoring: resourceMonitoringHealth,
    };

    this.lastHealthCheck = healthStatus;

    // Log health status changes
    if (overallStatus !== "healthy") {
      logger.warn("System health degraded", { healthStatus });
    } else {
      logger.debug("Health check completed", { status: overallStatus });
    }

    return healthStatus;
  }

  private async checkElasticsearchHealth(): Promise<HealthStatus["elasticsearch"]> {
    try {
      const startTime = Date.now();

      // Test basic connectivity
      const clusterInfo = await this.client.info();
      const responseTime = Date.now() - startTime;

      // Check cluster health
      const clusterHealth = await this.client.cluster.health();

      const isHealthy = clusterHealth.status === "green" || clusterHealth.status === "yellow";
      const isDegraded = clusterHealth.status === "yellow";

      return {
        status: isDegraded ? "degraded" : isHealthy ? "healthy" : "unhealthy",
        clusterName: clusterInfo.cluster_name,
        version: clusterInfo.version?.number,
        responseTime,
      };
    } catch (error) {
      logger.error("Elasticsearch health check failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        status: "unhealthy",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private checkConnectionPoolHealth(): HealthStatus["connectionPool"] {
    const pool = getGlobalConnectionPool();
    const stats = pool.getStats();

    const failureRate = stats.totalConnections > 0 ? stats.failedConnections / stats.totalConnections : 0;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";

    if (stats.activeConnections === 0) {
      status = "unhealthy";
    } else if (failureRate > 0.5) {
      status = "unhealthy";
    } else if (failureRate > 0.2) {
      status = "degraded";
    }

    return {
      status,
      activeConnections: stats.activeConnections,
      failedConnections: stats.failedConnections,
      totalConnections: stats.totalConnections,
    };
  }

  private checkServerHealth(): HealthStatus["server"] {
    const uptime = Date.now() - this.startTime;
    const memoryUsage = process.memoryUsage();

    return {
      status: "healthy", // Server is running if we can execute this
      uptime,
      memoryUsage,
      version: process.env.MCP_SERVER_VERSION || "0.1.1",
    };
  }

  private checkCachingHealth(): HealthStatus["caching"] {
    try {
      const stats = getAllCacheStats();

      // Calculate overall cache health based on hit rates
      const avgHitRate =
        Object.values(stats).reduce((sum, cache) => sum + cache.hitRate, 0) / Object.keys(stats).length;

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      if (avgHitRate < 0.2) status = "degraded"; // Less than 20% hit rate
      if (avgHitRate < 0.1) status = "unhealthy"; // Less than 10% hit rate

      return { status, stats };
    } catch (error) {
      return {
        status: "unhealthy",
        stats: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private checkConnectionWarmingHealth(): HealthStatus["connectionWarming"] {
    try {
      const stats = getConnectionWarmingStats();

      if (!stats) {
        return { status: "degraded", stats: { message: "Connection warming not initialized" } };
      }

      // Check success rates
      const warmupSuccessRate = stats.warmupOperations > 0 ? stats.successfulWarmups / stats.warmupOperations : 1;
      const keepAliveSuccessRate =
        stats.keepAliveOperations > 0 ? stats.successfulKeepAlives / stats.keepAliveOperations : 1;

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      if (warmupSuccessRate < 0.8 || keepAliveSuccessRate < 0.9) status = "degraded";
      if (warmupSuccessRate < 0.5 || keepAliveSuccessRate < 0.7) status = "unhealthy";

      return { status, stats };
    } catch (error) {
      return {
        status: "unhealthy",
        stats: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private checkCircuitBreakersHealth(): HealthStatus["circuitBreakers"] {
    try {
      const stats = getAllCircuitBreakerStats();

      // Check if any circuit breakers are open
      const openBreakers = Object.entries(stats).filter(([_, stat]) => stat.state === "open");
      const halfOpenBreakers = Object.entries(stats).filter(([_, stat]) => stat.state === "half_open");

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      if (halfOpenBreakers.length > 0) status = "degraded";
      if (openBreakers.length > 0) status = "unhealthy";

      return {
        status,
        stats: {
          ...stats,
          summary: {
            total: Object.keys(stats).length,
            open: openBreakers.length,
            halfOpen: halfOpenBreakers.length,
            closed: Object.keys(stats).length - openBreakers.length - halfOpenBreakers.length,
          },
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        stats: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private checkResourceMonitoringHealth(): HealthStatus["resourceMonitoring"] {
    try {
      const resourceMonitor = getResourceMonitor();
      const availability = resourceMonitor.checkResourceAvailability();
      const stats = resourceMonitor.getStats();

      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      if (!availability.available) {
        status = availability.reason?.includes("Memory") ? "unhealthy" : "degraded";
      }

      return {
        status,
        stats: {
          ...stats,
          availability,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        stats: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  private determineOverallStatus(
    esHealth: HealthStatus["elasticsearch"],
    poolHealth: HealthStatus["connectionPool"],
    serverHealth: HealthStatus["server"],
    cachingHealth?: HealthStatus["caching"],
    connectionWarmingHealth?: HealthStatus["connectionWarming"],
    circuitBreakersHealth?: HealthStatus["circuitBreakers"],
    resourceMonitoringHealth?: HealthStatus["resourceMonitoring"],
  ): "healthy" | "degraded" | "unhealthy" {
    const allComponents = [
      esHealth,
      poolHealth,
      serverHealth,
      cachingHealth,
      connectionWarmingHealth,
      circuitBreakersHealth,
      resourceMonitoringHealth,
    ].filter(Boolean); // Remove undefined components

    // If any core component is unhealthy, system is unhealthy
    if (esHealth.status === "unhealthy" || poolHealth.status === "unhealthy" || serverHealth.status === "unhealthy") {
      return "unhealthy";
    }

    // If any component is unhealthy, system is degraded (for performance components)
    if (allComponents.some((component) => component?.status === "unhealthy")) {
      return "degraded";
    }

    // If any component is degraded, system is degraded
    if (allComponents.some((component) => component?.status === "degraded")) {
      return "degraded";
    }

    return "healthy";
  }
}

// Global health monitor instance
let globalHealthMonitor: HealthMonitor;

export function initializeHealthMonitor(client: Client, intervalMs = 30000): HealthMonitor {
  if (globalHealthMonitor) {
    globalHealthMonitor.stop();
  }

  globalHealthMonitor = new HealthMonitor(client, intervalMs);
  return globalHealthMonitor;
}

export function getHealthMonitor(): HealthMonitor {
  if (!globalHealthMonitor) {
    throw new Error("Health monitor not initialized. Call initializeHealthMonitor() first.");
  }
  return globalHealthMonitor;
}

export async function getQuickHealthStatus(): Promise<{ status: string; timestamp: string }> {
  try {
    const monitor = getHealthMonitor();
    const health = await monitor.getHealthStatus();

    return {
      status: health.status,
      timestamp: health.timestamp,
    };
  } catch (_error) {
    return {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
    };
  }
}
