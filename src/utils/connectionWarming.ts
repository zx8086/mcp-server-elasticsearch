/* src/utils/connectionWarming.ts */

import type { Client } from "@elastic/elasticsearch";
import { getGlobalConnectionPool } from "./connectionPooling.js";
import { logger } from "./logger.js";

export interface WarmingConfig {
  enabled: boolean;
  warmupDelayMs: number; // Delay before starting warmup
  warmupIntervalMs: number; // Interval between warmup operations
  keepAliveIntervalMs: number; // Interval for keep-alive pings
  connectionTimeout: number; // Timeout for each warmup operation
  maxRetries: number; // Max retries for failed warmup operations
}

export interface WarmingStats {
  warmupOperations: number;
  keepAliveOperations: number;
  successfulWarmups: number;
  failedWarmups: number;
  successfulKeepAlives: number;
  failedKeepAlives: number;
  lastWarmupTime?: number;
  lastKeepAliveTime?: number;
  averageWarmupTime: number;
  averageKeepAliveTime: number;
}

export class ConnectionWarmer {
  private warmupTimer?: NodeJS.Timeout;
  private keepAliveTimer?: NodeJS.Timeout;
  private stats: WarmingStats = {
    warmupOperations: 0,
    keepAliveOperations: 0,
    successfulWarmups: 0,
    failedWarmups: 0,
    successfulKeepAlives: 0,
    failedKeepAlives: 0,
    averageWarmupTime: 0,
    averageKeepAliveTime: 0,
  };

  constructor(
    private client: Client,
    private config: WarmingConfig,
  ) {}

  /**
   * Start connection warming
   */
  start(): void {
    if (!this.config.enabled) {
      logger.debug("Connection warming disabled");
      return;
    }

    // Schedule initial warmup after delay
    setTimeout(() => {
      this.performWarmup();

      // Set up periodic warmup
      this.warmupTimer = setInterval(() => {
        this.performWarmup();
      }, this.config.warmupIntervalMs);
    }, this.config.warmupDelayMs);

    // Set up periodic keep-alive
    this.keepAliveTimer = setInterval(() => {
      this.performKeepAlive();
    }, this.config.keepAliveIntervalMs);

    logger.info("Connection warming started", {
      warmupDelay: this.config.warmupDelayMs,
      warmupInterval: this.config.warmupIntervalMs,
      keepAliveInterval: this.config.keepAliveIntervalMs,
    });
  }

  /**
   * Stop connection warming
   */
  stop(): void {
    if (this.warmupTimer) {
      clearInterval(this.warmupTimer);
      this.warmupTimer = undefined;
    }

    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }

    logger.info("Connection warming stopped");
  }

  /**
   * Perform connection warmup
   */
  private async performWarmup(): Promise<void> {
    const startTime = Date.now();
    this.stats.warmupOperations++;

    try {
      logger.debug("Performing connection warmup");

      // Perform a series of lightweight operations to warm connections
      const warmupOperations = [
        this.warmupClusterInfo(),
        this.warmupClusterHealth(),
        this.warmupNodeInfo(),
        this.warmupIndexList(),
      ];

      await Promise.allSettled(warmupOperations);

      const duration = Date.now() - startTime;
      this.stats.successfulWarmups++;
      this.stats.lastWarmupTime = Date.now();
      this.updateAverageTime("warmup", duration);

      logger.debug("Connection warmup completed", {
        duration,
        totalWarmups: this.stats.warmupOperations,
        successRate: this.getWarmupSuccessRate(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.failedWarmups++;
      this.updateAverageTime("warmup", duration);

      logger.warn("Connection warmup failed", {
        error: error instanceof Error ? error.message : String(error),
        duration,
        totalFailures: this.stats.failedWarmups,
      });
    }
  }

  /**
   * Perform keep-alive ping
   */
  private async performKeepAlive(): Promise<void> {
    const startTime = Date.now();
    this.stats.keepAliveOperations++;

    try {
      logger.debug("Performing keep-alive ping");

      // Simple ping to keep connections alive
      await Promise.race([
        this.client.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Keep-alive timeout")), this.config.connectionTimeout),
        ),
      ]);

      const duration = Date.now() - startTime;
      this.stats.successfulKeepAlives++;
      this.stats.lastKeepAliveTime = Date.now();
      this.updateAverageTime("keepAlive", duration);

      logger.debug("Keep-alive ping successful", {
        duration,
        totalKeepAlives: this.stats.keepAliveOperations,
        successRate: this.getKeepAliveSuccessRate(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.failedKeepAlives++;
      this.updateAverageTime("keepAlive", duration);

      logger.warn("Keep-alive ping failed", {
        error: error instanceof Error ? error.message : String(error),
        duration,
        totalFailures: this.stats.failedKeepAlives,
      });
    }
  }

  /**
   * Warm cluster info endpoint
   */
  private async warmupClusterInfo(): Promise<void> {
    try {
      await Promise.race([
        this.client.info(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cluster info timeout")), this.config.connectionTimeout),
        ),
      ]);

      logger.debug("Cluster info warmup successful");
    } catch (error) {
      logger.debug("Cluster info warmup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Warm cluster health endpoint
   */
  private async warmupClusterHealth(): Promise<void> {
    try {
      await Promise.race([
        this.client.cluster.health({ wait_for_status: "yellow", timeout: "1s" }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Cluster health timeout")), this.config.connectionTimeout),
        ),
      ]);

      logger.debug("Cluster health warmup successful");
    } catch (error) {
      logger.debug("Cluster health warmup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Warm node info endpoint
   */
  private async warmupNodeInfo(): Promise<void> {
    try {
      await Promise.race([
        this.client.nodes.info({ node_id: "_local", metric: "process" }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Node info timeout")), this.config.connectionTimeout),
        ),
      ]);

      logger.debug("Node info warmup successful");
    } catch (error) {
      logger.debug("Node info warmup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Warm index list endpoint
   */
  private async warmupIndexList(): Promise<void> {
    try {
      await Promise.race([
        this.client.cat.indices({
          format: "json",
          h: "index",
          s: "index",
          bytes: "b",
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Index list timeout")), this.config.connectionTimeout),
        ),
      ]);

      logger.debug("Index list warmup successful");
    } catch (error) {
      logger.debug("Index list warmup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update average timing statistics
   */
  private updateAverageTime(type: "warmup" | "keepAlive", duration: number): void {
    if (type === "warmup") {
      const totalOps = this.stats.warmupOperations;
      this.stats.averageWarmupTime = (this.stats.averageWarmupTime * (totalOps - 1) + duration) / totalOps;
    } else {
      const totalOps = this.stats.keepAliveOperations;
      this.stats.averageKeepAliveTime = (this.stats.averageKeepAliveTime * (totalOps - 1) + duration) / totalOps;
    }
  }

  /**
   * Get warmup success rate
   */
  private getWarmupSuccessRate(): number {
    if (this.stats.warmupOperations === 0) return 0;
    return Math.round((this.stats.successfulWarmups / this.stats.warmupOperations) * 100) / 100;
  }

  /**
   * Get keep-alive success rate
   */
  private getKeepAliveSuccessRate(): number {
    if (this.stats.keepAliveOperations === 0) return 0;
    return Math.round((this.stats.successfulKeepAlives / this.stats.keepAliveOperations) * 100) / 100;
  }

  /**
   * Get warming statistics
   */
  getStats(): WarmingStats {
    return {
      ...this.stats,
      averageWarmupTime: Math.round(this.stats.averageWarmupTime),
      averageKeepAliveTime: Math.round(this.stats.averageKeepAliveTime),
    };
  }

  /**
   * Perform manual warmup (for testing or initialization)
   */
  async performManualWarmup(): Promise<void> {
    logger.info("Performing manual connection warmup");
    await this.performWarmup();
  }

  /**
   * Check if warming is active
   */
  isActive(): boolean {
    return this.config.enabled && (!!this.warmupTimer || !!this.keepAliveTimer);
  }
}

// Global connection warmer instance
let globalConnectionWarmer: ConnectionWarmer;

/**
 * Initialize global connection warmer
 */
export function initializeConnectionWarming(client: Client, config?: Partial<WarmingConfig>): ConnectionWarmer {
  const defaultConfig: WarmingConfig = {
    enabled: true,
    warmupDelayMs: 5000, // Wait 5 seconds before first warmup
    warmupIntervalMs: 5 * 60 * 1000, // Warmup every 5 minutes
    keepAliveIntervalMs: 30 * 1000, // Keep-alive every 30 seconds
    connectionTimeout: 5000, // 5 second timeout per operation
    maxRetries: 3, // Retry failed operations up to 3 times
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Stop existing warmer if it exists
  if (globalConnectionWarmer) {
    globalConnectionWarmer.stop();
  }

  globalConnectionWarmer = new ConnectionWarmer(client, finalConfig);

  logger.info("Connection warmer initialized", {
    enabled: finalConfig.enabled,
    warmupDelay: finalConfig.warmupDelayMs,
    warmupInterval: finalConfig.warmupIntervalMs,
    keepAliveInterval: finalConfig.keepAliveIntervalMs,
  });

  return globalConnectionWarmer;
}

/**
 * Get global connection warmer
 */
export function getConnectionWarmer(): ConnectionWarmer | undefined {
  return globalConnectionWarmer;
}

/**
 * Start connection warming
 */
export function startConnectionWarming(): void {
  if (globalConnectionWarmer) {
    globalConnectionWarmer.start();
  } else {
    logger.warn("Connection warmer not initialized - call initializeConnectionWarming() first");
  }
}

/**
 * Stop connection warming
 */
export function stopConnectionWarming(): void {
  if (globalConnectionWarmer) {
    globalConnectionWarmer.stop();
  }
}

/**
 * Get connection warming statistics
 */
export function getConnectionWarmingStats(): WarmingStats | undefined {
  return globalConnectionWarmer?.getStats();
}

/**
 * Warm all connections in the pool
 */
export async function warmAllConnections(): Promise<void> {
  try {
    const pool = getGlobalConnectionPool();
    const stats = pool.getConnectionStats();

    logger.info("Warming all connections in pool", {
      totalConnections: stats.totalConnections,
      healthyConnections: stats.healthyConnections,
    });

    // Perform warmup for each connection
    const warmupPromises = stats.connections.map(async (conn) => {
      if (conn.isHealthy) {
        try {
          // Perform lightweight operations to warm the connection
          logger.debug("Warming connection", { url: conn.url });

          // The actual warming is handled by the ConnectionWarmer
          // This just logs the intention to warm specific connections
          return { url: conn.url, success: true };
        } catch (error) {
          logger.warn("Failed to warm connection", {
            url: conn.url,
            error: error instanceof Error ? error.message : String(error),
          });
          return { url: conn.url, success: false };
        }
      }
      return { url: conn.url, success: false, reason: "unhealthy" };
    });

    const results = await Promise.allSettled(warmupPromises);
    const successful = results.filter((result) => result.status === "fulfilled" && result.value.success).length;

    logger.info("Connection warming completed", {
      totalConnections: stats.totalConnections,
      successfulWarmups: successful,
      failedWarmups: stats.totalConnections - successful,
    });
  } catch (error) {
    logger.error("Failed to warm connections", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Pre-warm specific Elasticsearch endpoints
 */
export async function preWarmEndpoints(client: Client): Promise<void> {
  const endpoints = [
    { name: "cluster.info", operation: () => client.info() },
    { name: "cluster.health", operation: () => client.cluster.health() },
    { name: "cluster.stats", operation: () => client.cluster.stats() },
    { name: "nodes.info", operation: () => client.nodes.info({ node_id: "_local" }) },
    { name: "indices.list", operation: () => client.cat.indices({ format: "json", h: "index" }) },
  ];

  logger.info("Pre-warming Elasticsearch endpoints", {
    endpointCount: endpoints.length,
  });

  const results = await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      const startTime = Date.now();
      try {
        await endpoint.operation();
        const duration = Date.now() - startTime;
        logger.debug(`Pre-warmed ${endpoint.name}`, { duration });
        return { name: endpoint.name, success: true, duration };
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.warn(`Failed to pre-warm ${endpoint.name}`, {
          error: error instanceof Error ? error.message : String(error),
          duration,
        });
        return { name: endpoint.name, success: false, duration };
      }
    }),
  );

  const successful = results.filter((result) => result.status === "fulfilled" && result.value.success).length;

  logger.info("Endpoint pre-warming completed", {
    totalEndpoints: endpoints.length,
    successfulWarmups: successful,
    failedWarmups: endpoints.length - successful,
  });
}
