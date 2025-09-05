import http from "node:http";
import { logger } from "../utils/logger.js";
import { metrics } from "./prometheusMetrics.js";

export class MetricsEndpoint {
  private server: http.Server | null = null;
  private port: number;
  private enabled: boolean;

  constructor(port = 9090) {
    this.port = port;
    this.enabled = metrics.isEnabled();
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.enabled) {
        logger.info("[MetricsEndpoint] Prometheus metrics disabled - prom-client not available");
        resolve();
        return;
      }

      this.server = http.createServer((req, res) => {
        if (req.method === "GET" && req.url === "/metrics") {
          this.handleMetricsRequest(req, res);
        } else if (req.method === "GET" && req.url === "/health") {
          this.handleHealthRequest(req, res);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      });

      this.server.on("error", (error) => {
        logger.error("[MetricsEndpoint] Server error:", { error: error.message });
        reject(error);
      });

      this.server.listen(this.port, () => {
        logger.info(`[MetricsEndpoint] Prometheus metrics server started on port ${this.port}`);
        logger.info(`[MetricsEndpoint] Metrics available at http://localhost:${this.port}/metrics`);
        logger.info(`[MetricsEndpoint] Health check available at http://localhost:${this.port}/health`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info("[MetricsEndpoint] Prometheus metrics server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private handleMetricsRequest(_req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const metricsData = metrics.getMetrics();

      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      res.end(metricsData);
    } catch (error) {
      logger.error("[MetricsEndpoint] Error serving metrics:", { error });
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }

  private handleHealthRequest(_req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const healthData = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        metrics_enabled: this.enabled,
        uptime: process.uptime(),
        version: process.version,
      };

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      res.end(JSON.stringify(healthData, null, 2));
    } catch (error) {
      logger.error("[MetricsEndpoint] Error serving health check:", { error });
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }

  public isRunning(): boolean {
    return this.server?.listening;
  }

  public getPort(): number {
    return this.port;
  }
}
