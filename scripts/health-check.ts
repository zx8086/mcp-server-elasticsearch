#!/usr/bin/env bun

import { getConfig } from "../src/config.js";
import { HealthCheckType, HealthStatus, createHealthCheckSystem } from "../src/health/healthCheckSystem.js";
import { createElasticsearchMCPServer } from "../src/server.js";

async function runHealthCheck() {
  console.log("🏥 Running Elasticsearch MCP Server Health Check");
  console.log("=".repeat(50));

  try {
    const config = getConfig();
    const server = createElasticsearchMCPServer(config);

    // Mock dependencies for health check demo
    const mockCircuitBreakers = new Map();
    const mockConnectionPool = {
      getStats: () => ({
        totalConnections: 5,
        activeConnections: 3,
        healthyConnections: 5,
        averageResponseTime: 45.2,
      }),
    };
    const mockCaches = new Map();

    const healthSystem = createHealthCheckSystem(server.esClient, mockCircuitBreakers, mockConnectionPool, mockCaches);

    // Run different types of health checks
    console.log("🔍 Running critical health checks...");
    const criticalHealth = await healthSystem.runHealthChecks(HealthCheckType.CRITICAL_ONLY);
    displayHealthResults(criticalHealth, "Critical Systems");

    console.log("\n🔍 Running comprehensive health checks...");
    const fullHealth = await healthSystem.runHealthChecks(HealthCheckType.DEEP);
    displayHealthResults(fullHealth, "All Systems");

    // Generate summary report
    console.log("\n📊 Generating audit summary...");
    // const auditSummary = await healthSystem.getAuditSummary(24);
    // displayAuditSummary(auditSummary);

    // Clean up
    healthSystem.destroy();

    const exitCode = fullHealth.overall === HealthStatus.HEALTHY ? 0 : 1;
    console.log(`\n${exitCode === 0 ? "✅" : "❌"} Health check completed with exit code ${exitCode}`);
    process.exit(exitCode);
  } catch (error) {
    console.error("❌ Health check failed:", error);
    process.exit(1);
  }
}

function displayHealthResults(health: any, title: string): void {
  console.log(`\n📋 ${title} Health Report`);
  console.log("-".repeat(30));

  // Overall status
  const statusEmoji = getStatusEmoji(health.overall);
  console.log(`Overall Status: ${statusEmoji} ${health.overall.toUpperCase()}`);
  console.log(`Duration: ${health.duration.toFixed(2)}ms`);
  console.log(`Checks: ${health.summary.total}`);

  // Summary breakdown
  if (health.summary.healthy > 0) {
    console.log(`✅ Healthy: ${health.summary.healthy}`);
  }
  if (health.summary.degraded > 0) {
    console.log(`⚠️  Degraded: ${health.summary.degraded}`);
  }
  if (health.summary.unhealthy > 0) {
    console.log(`❌ Unhealthy: ${health.summary.unhealthy}`);
  }
  if (health.summary.critical > 0) {
    console.log(`🚨 Critical: ${health.summary.critical}`);
  }

  // Individual check results
  console.log("\n📝 Individual Check Results:");
  for (const check of health.checks) {
    const emoji = getStatusEmoji(check.status);
    const duration = check.duration.toFixed(1);
    console.log(`   ${emoji} ${check.name}: ${check.status} (${duration}ms)`);

    if (check.message && check.status !== HealthStatus.HEALTHY) {
      console.log(`      ${check.message}`);
    }

    if (check.recommendations) {
      for (const recommendation of check.recommendations) {
        console.log(`      💡 ${recommendation}`);
      }
    }
  }

  // Alerts
  if (health.alerts.length > 0) {
    console.log("\n🚨 Active Alerts:");
    for (const alert of health.alerts) {
      const alertEmoji = getAlertEmoji(alert.level);
      console.log(`   ${alertEmoji} [${alert.level.toUpperCase()}] ${alert.message}`);
    }
  }

  // Trends
  if (health.trends.direction !== "stable") {
    const trendEmoji = health.trends.direction === "improving" ? "📈" : "📉";
    console.log(
      `\n${trendEmoji} Trend: ${health.trends.direction} (confidence: ${(health.trends.confidence * 100).toFixed(1)}%)`,
    );
  }
}

function getStatusEmoji(status: HealthStatus): string {
  switch (status) {
    case HealthStatus.HEALTHY:
      return "✅";
    case HealthStatus.DEGRADED:
      return "⚠️";
    case HealthStatus.UNHEALTHY:
      return "❌";
    case HealthStatus.CRITICAL:
      return "🚨";
    default:
      return "❓";
  }
}

function getAlertEmoji(level: string): string {
  switch (level) {
    case "info":
      return "ℹ️";
    case "warning":
      return "⚠️";
    case "error":
      return "❌";
    case "critical":
      return "🚨";
    default:
      return "📢";
  }
}

if (import.meta.main) {
  runHealthCheck().catch(console.error);
}
