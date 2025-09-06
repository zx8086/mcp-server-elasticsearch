/* src/monitoring/metricsCollector.ts */

import { metrics } from "./prometheusMetrics.js";

// Singleton metrics collector to bridge observability components
class MetricsCollectorService {
  private static instance: MetricsCollectorService;

  public static getInstance(): MetricsCollectorService {
    if (!MetricsCollectorService.instance) {
      MetricsCollectorService.instance = new MetricsCollectorService();
    }
    return MetricsCollectorService.instance;
  }

  public recordElasticsearchMetrics(esMetrics: {
    averageResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
    activeConnections: number;
  }): void {
    metrics.recordElasticsearchMetrics(esMetrics);
  }

  public recordToolExecution(
    toolName: string,
    category: string,
    duration: number,
    status: "success" | "error" | "timeout"
  ): void {
    metrics.recordToolExecution(toolName, category, duration, status);
  }

  public recordElasticsearchOperation(
    operation: string,
    index: string,
    duration: number,
    success: boolean,
    errorCode?: string
  ): void {
    metrics.recordElasticsearchOperation(operation, index, duration, success, errorCode);
  }

  public isEnabled(): boolean {
    return metrics.isEnabled();
  }
}

export function getMetricsCollector(): MetricsCollectorService {
  return MetricsCollectorService.getInstance();
}