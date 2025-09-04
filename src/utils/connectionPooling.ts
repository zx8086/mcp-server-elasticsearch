/* src/utils/connectionPooling.ts */

import type { Client } from "@elastic/elasticsearch";
import { logger } from "./logger.js";

/**
 * Production-ready Elasticsearch connection pool manager
 * Provides:
 * - Connection health monitoring
 * - Automatic failover
 * - Load balancing
 * - Connection metrics
 * - Graceful degradation
 */

interface ConnectionInfo {
  client: Client;
  url: string;
  isHealthy: boolean;
  lastHealthCheck: number;
  errorCount: number;
  requestCount: number;
  responseTime: number;
}

interface PoolConfig {
  healthCheckInterval: number;
  maxErrorCount: number;
  healthCheckTimeout: number;
  loadBalanceStrategy: "round-robin" | "least-connections" | "fastest-response";
}

export class ElasticsearchConnectionPool {
  private connections: Map<string, ConnectionInfo> = new Map();
  private currentIndex = 0;
  private healthCheckTimer?: NodeJS.Timeout;
  private config: PoolConfig;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = {
      healthCheckInterval: 30000, // 30 seconds
      maxErrorCount: 3,
      healthCheckTimeout: 5000,
      loadBalanceStrategy: "round-robin",
      ...config,
    };
  }

  addConnection(url: string, client: Client): void {
    const connectionInfo: ConnectionInfo = {
      client,
      url,
      isHealthy: true,
      lastHealthCheck: Date.now(),
      errorCount: 0,
      requestCount: 0,
      responseTime: 0,
    };

    this.connections.set(url, connectionInfo);
    logger.info("Added Elasticsearch connection to pool", { url, totalConnections: this.connections.size });

    // Start health checking if this is the first connection
    if (this.connections.size === 1) {
      this.startHealthChecking();
    }
  }

  removeConnection(url: string): void {
    if (this.connections.delete(url)) {
      logger.info("Removed Elasticsearch connection from pool", { url, remainingConnections: this.connections.size });
    }

    if (this.connections.size === 0 && this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  getHealthyConnection(): Client | null {
    const healthyConnections = Array.from(this.connections.values()).filter((conn) => conn.isHealthy);

    if (healthyConnections.length === 0) {
      logger.error("No healthy Elasticsearch connections available");
      return null;
    }

    let selectedConnection: ConnectionInfo;

    switch (this.config.loadBalanceStrategy) {
      case "round-robin":
        selectedConnection = healthyConnections[this.currentIndex % healthyConnections.length];
        this.currentIndex++;
        break;

      case "least-connections":
        selectedConnection = healthyConnections.reduce((min, current) =>
          current.requestCount < min.requestCount ? current : min,
        );
        break;

      case "fastest-response":
        selectedConnection = healthyConnections.reduce((fastest, current) =>
          current.responseTime < fastest.responseTime ? current : fastest,
        );
        break;

      default:
        selectedConnection = healthyConnections[0];
    }

    selectedConnection.requestCount++;
    return selectedConnection.client;
  }

  async executeWithRetry<T>(operation: (client: Client) => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: any;
    let attempts = 0;

    while (attempts <= maxRetries) {
      const client = this.getHealthyConnection();

      if (!client) {
        throw new Error("No healthy Elasticsearch connections available");
      }

      try {
        const startTime = performance.now();
        const result = await operation(client);
        const duration = performance.now() - startTime;

        // Update connection metrics
        this.updateConnectionMetrics(client, duration, true);

        return result;
      } catch (error) {
        lastError = error;
        attempts++;

        // Update connection metrics
        this.updateConnectionMetrics(client, 0, false);

        logger.warn(`Elasticsearch operation failed, attempt ${attempts}/${maxRetries + 1}`, {
          error: error instanceof Error ? error.message : String(error),
          attemptsRemaining: maxRetries - attempts + 1,
        });

        if (attempts <= maxRetries) {
          // Wait before retry with exponential backoff
          await this.sleep(2 ** (attempts - 1) * 1000);
        }
      }
    }

    throw lastError;
  }

  private updateConnectionMetrics(client: Client, duration: number, success: boolean): void {
    for (const [url, connection] of this.connections.entries()) {
      if (connection.client === client) {
        if (success) {
          connection.responseTime = (connection.responseTime + duration) / 2; // Running average
          connection.errorCount = Math.max(0, connection.errorCount - 1); // Decrease error count on success
        } else {
          connection.errorCount++;
          if (connection.errorCount >= this.config.maxErrorCount) {
            connection.isHealthy = false;
            logger.warn("Marking connection as unhealthy due to errors", {
              url,
              errorCount: connection.errorCount,
            });
          }
        }
        break;
      }
    }
  }

  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);

    logger.info("Started Elasticsearch connection health monitoring", {
      interval: this.config.healthCheckInterval,
      connections: this.connections.size,
    });
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.connections.entries()).map(async ([url, connection]) => {
      try {
        const startTime = performance.now();

        // Perform health check with timeout
        await Promise.race([
          connection.client.ping(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Health check timeout")), this.config.healthCheckTimeout),
          ),
        ]);

        const duration = performance.now() - startTime;

        // Connection is healthy
        if (!connection.isHealthy) {
          logger.info("Connection recovered", { url });
        }

        connection.isHealthy = true;
        connection.lastHealthCheck = Date.now();
        connection.responseTime = duration;
        connection.errorCount = Math.max(0, connection.errorCount - 1);
      } catch (error) {
        connection.errorCount++;
        connection.lastHealthCheck = Date.now();

        if (connection.errorCount >= this.config.maxErrorCount) {
          if (connection.isHealthy) {
            logger.error("Connection failed health check", {
              url,
              error: error instanceof Error ? error.message : String(error),
              errorCount: connection.errorCount,
            });
          }
          connection.isHealthy = false;
        }
      }
    });

    await Promise.allSettled(healthCheckPromises);

    const healthyCount = Array.from(this.connections.values()).filter((conn) => conn.isHealthy).length;

    if (healthyCount === 0) {
      logger.error("All Elasticsearch connections are unhealthy!");
    } else {
      logger.debug("Health check completed", {
        healthy: healthyCount,
        total: this.connections.size,
      });
    }
  }

  getConnectionStats() {
    const connections = Array.from(this.connections.entries()).map(([url, conn]) => ({
      url,
      isHealthy: conn.isHealthy,
      errorCount: conn.errorCount,
      requestCount: conn.requestCount,
      averageResponseTime: Math.round(conn.responseTime),
      lastHealthCheck: new Date(conn.lastHealthCheck).toISOString(),
    }));

    return {
      totalConnections: this.connections.size,
      healthyConnections: connections.filter((c) => c.isHealthy).length,
      loadBalanceStrategy: this.config.loadBalanceStrategy,
      connections,
    };
  }

  /**
   * Get simplified stats for health monitoring
   */
  getStats() {
    const totalConnections = this.connections.size;
    const activeConnections = Array.from(this.connections.values()).filter(c => c.isHealthy).length;
    const failedConnections = totalConnections - activeConnections;

    return {
      totalConnections,
      activeConnections,
      failedConnections,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.connections.clear();
    logger.info("Elasticsearch connection pool destroyed");
  }
}

// Singleton instance for application-wide use
let globalPool: ElasticsearchConnectionPool | null = null;

export function getGlobalConnectionPool(config?: Partial<PoolConfig>): ElasticsearchConnectionPool {
  if (!globalPool) {
    globalPool = new ElasticsearchConnectionPool(config);
  }
  return globalPool;
}

export function destroyGlobalConnectionPool(): void {
  if (globalPool) {
    globalPool.destroy();
    globalPool = null;
  }
}
