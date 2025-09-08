/* src/security/auditTrail.ts */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { metrics } from "../monitoring/prometheusMetrics.js";
import { logger } from "../utils/logger.js";

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  toolName: string;
  category: string;
  userId?: string;
  sessionId?: string;
  clientType?: string;
  operation: OperationDetails;
  security: SecurityContext;
  result: OperationResult;
  metadata: AuditMetadata;
}

export enum AuditEventType {
  TOOL_EXECUTION = "tool_execution",
  SECURITY_VIOLATION = "security_violation",
  AUTHENTICATION_FAILURE = "authentication_failure",
  RATE_LIMIT_HIT = "rate_limit_hit",
  CIRCUIT_BREAKER_TRIP = "circuit_breaker_trip",
  READ_ONLY_BLOCK = "read_only_block",
  SUSPICIOUS_ACTIVITY = "suspicious_activity",
  CONFIGURATION_CHANGE = "configuration_change",
  CONNECTION_EVENT = "connection_event",
  ERROR_EVENT = "error_event",
}

interface OperationDetails {
  operation: string;
  operationType: "read" | "write" | "destructive";
  targetIndex?: string;
  targetCluster?: string;
  parameters?: any;
  sanitizedParameters?: any;
}

interface SecurityContext {
  ipAddress?: string;
  userAgent?: string;
  authMethod?: string;
  permissions?: string[];
  validationsPassed: string[];
  validationsFailed: string[];
  securityScore: number;
}

interface OperationResult {
  status: "success" | "error" | "blocked" | "timeout";
  duration: number;
  errorCode?: string;
  errorMessage?: string;
  recordsAffected?: number;
  dataSize?: number;
}

interface AuditMetadata {
  version: string;
  runtime: string;
  serverInstance?: string;
  traceId?: string;
  correlationId?: string;
  tags?: string[];
}

interface AuditConfiguration {
  enabled: boolean;
  logLevel: "minimal" | "standard" | "detailed";
  retention: {
    days: number;
    maxFiles: number;
    maxSizeMB: number;
  };
  alerts: {
    enabled: boolean;
    thresholds: {
      securityViolationsPerHour: number;
      failedAuthenticationsPerHour: number;
      suspiciousActivityScore: number;
    };
  };
  storage: {
    type: "file" | "elasticsearch" | "both";
    directory: string;
    indexPrefix?: string;
  };
  encryption: {
    enabled: boolean;
    algorithm: string;
    keyRotationDays: number;
  };
}

export class SecurityAuditTrail {
  private config: AuditConfiguration;
  private auditBuffer: AuditEvent[] = [];
  private flushTimer: Timer | null = null;
  private encryptionKey: string | null = null;
  private eventCounts: Map<AuditEventType, number> = new Map();
  private suspiciousPatterns: Map<string, number> = new Map();

  constructor(config: Partial<AuditConfiguration> = {}) {
    this.config = {
      enabled: true,
      logLevel: "standard",
      retention: {
        days: 90,
        maxFiles: 100,
        maxSizeMB: 1000,
      },
      alerts: {
        enabled: true,
        thresholds: {
          securityViolationsPerHour: 10,
          failedAuthenticationsPerHour: 5,
          suspiciousActivityScore: 8,
        },
      },
      storage: {
        type: "file",
        directory: "audit",
      },
      encryption: {
        enabled: false,
        algorithm: "aes-256-gcm",
        keyRotationDays: 30,
      },
      ...config,
    };

    this.initializeAuditTrail();
  }

  private async initializeAuditTrail(): Promise<void> {
    if (!this.config.enabled) {
      logger.info("Security audit trail disabled");
      return;
    }

    try {
      // Ensure audit directory exists
      await fs.mkdir(this.config.storage.directory, { recursive: true });

      // Initialize encryption if enabled
      if (this.config.encryption.enabled) {
        await this.initializeEncryption();
      }

      // Start periodic flush
      this.startPeriodicFlush();

      // Initialize event counters
      for (const eventType of Object.values(AuditEventType)) {
        this.eventCounts.set(eventType, 0);
      }

      logger.info("Security audit trail initialized", {
        directory: this.config.storage.directory,
        level: this.config.logLevel,
        encryption: this.config.encryption.enabled,
      });

      // Log initialization event
      await this.logEvent({
        eventType: AuditEventType.CONFIGURATION_CHANGE,
        toolName: "audit_trail",
        category: "security",
        operation: {
          operation: "initialize",
          operationType: "read",
        },
        security: {
          validationsPassed: ["initialization"],
          validationsFailed: [],
          securityScore: 10,
        },
        result: {
          status: "success",
          duration: 0,
        },
      });
    } catch (error) {
      logger.error("Failed to initialize security audit trail", { error });
    }
  }

  public async logEvent(eventData: Partial<AuditEvent>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const auditEvent: AuditEvent = {
        id: this.generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: eventData.eventType || AuditEventType.TOOL_EXECUTION,
        toolName: eventData.toolName || "unknown",
        category: eventData.category || "general",
        userId: eventData.userId,
        sessionId: eventData.sessionId,
        clientType: eventData.clientType,
        operation: {
          operation: "unknown",
          operationType: "read",
          ...eventData.operation,
          sanitizedParameters: eventData.operation?.parameters
            ? this.sanitizeParameters(eventData.operation.parameters)
            : undefined,
        },
        security: {
          validationsPassed: [],
          validationsFailed: [],
          securityScore: 5,
          ...eventData.security,
        },
        result: {
          status: "success",
          duration: 0,
          ...eventData.result,
        },
        metadata: {
          version: "1.0.0",
          runtime: `Bun ${Bun.version}`,
          serverInstance: process.env.INSTANCE_ID || "unknown",
          ...eventData.metadata,
        },
      };

      // Update event counters
      const currentCount = this.eventCounts.get(auditEvent.eventType) || 0;
      this.eventCounts.set(auditEvent.eventType, currentCount + 1);

      // Check for suspicious patterns
      await this.analyzeSecurityPatterns(auditEvent);

      // Add to buffer
      this.auditBuffer.push(auditEvent);

      // Update metrics
      if (metrics.isEnabled()) {
        if (auditEvent.eventType === AuditEventType.SECURITY_VIOLATION) {
          metrics.recordSecurityValidationFailure(
            auditEvent.toolName,
            auditEvent.security.validationsFailed[0] || "unknown",
          );
        }

        if (auditEvent.eventType === AuditEventType.READ_ONLY_BLOCK) {
          metrics.recordReadOnlyModeBlock(auditEvent.toolName, auditEvent.operation.operationType);
        }

        if (auditEvent.eventType === AuditEventType.RATE_LIMIT_HIT) {
          metrics.recordRateLimitHit("tool_execution");
        }
      }

      // Immediate flush for critical events
      if (this.isCriticalEvent(auditEvent)) {
        await this.flushBuffer();
      }

      // Log to standard logger based on event type
      this.logToStandardLogger(auditEvent);
    } catch (error) {
      logger.error("Failed to log audit event", { error, eventType: eventData.eventType });
    }
  }

  public async logToolExecution(
    toolName: string,
    category: string,
    operation: OperationDetails,
    result: OperationResult,
    securityContext: Partial<SecurityContext> = {},
    sessionInfo: { sessionId?: string; userId?: string; clientType?: string } = {},
  ): Promise<void> {
    await this.logEvent({
      eventType: AuditEventType.TOOL_EXECUTION,
      toolName,
      category,
      operation,
      result,
      security: {
        validationsPassed: [],
        validationsFailed: [],
        securityScore: 5,
        ...securityContext,
      },
      ...sessionInfo,
    });
  }

  public async logSecurityViolation(
    toolName: string,
    violationType: string,
    details: any,
    securityContext: SecurityContext,
  ): Promise<void> {
    await this.logEvent({
      eventType: AuditEventType.SECURITY_VIOLATION,
      toolName,
      category: "security",
      operation: {
        operation: violationType,
        operationType: "read",
        parameters: details,
      },
      security: securityContext,
      result: {
        status: "blocked",
        duration: 0,
      },
      metadata: {
        tags: ["security", "violation", violationType],
      },
    });
  }

  public async logSuspiciousActivity(
    description: string,
    severity: "low" | "medium" | "high",
    context: any,
  ): Promise<void> {
    const securityScore = severity === "high" ? 9 : severity === "medium" ? 6 : 3;

    await this.logEvent({
      eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
      toolName: "security_monitor",
      category: "security",
      operation: {
        operation: "suspicious_activity_detected",
        operationType: "read",
        parameters: context,
      },
      security: {
        validationsPassed: [],
        validationsFailed: [description],
        securityScore,
      },
      result: {
        status: "blocked",
        duration: 0,
      },
      metadata: {
        tags: ["suspicious", severity, "automated_detection"],
      },
    });
  }

  public async getAuditSummary(hours = 24): Promise<{
    totalEvents: number;
    eventsByType: { [key: string]: number };
    securityEvents: number;
    topTools: { tool: string; count: number }[];
    suspiciousActivity: { pattern: string; count: number }[];
    recommendations: string[];
  }> {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      const recentEvents = await this.getRecentEvents(cutoffTime);

      const eventsByType: { [key: string]: number } = {};
      const toolCounts: { [key: string]: number } = {};
      let securityEvents = 0;

      for (const event of recentEvents) {
        eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
        toolCounts[event.toolName] = (toolCounts[event.toolName] || 0) + 1;

        if (
          [
            AuditEventType.SECURITY_VIOLATION,
            AuditEventType.SUSPICIOUS_ACTIVITY,
            AuditEventType.AUTHENTICATION_FAILURE,
          ].includes(event.eventType)
        ) {
          securityEvents++;
        }
      }

      const topTools = Object.entries(toolCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([tool, count]) => ({ tool, count }));

      const suspiciousActivity = Array.from(this.suspiciousPatterns.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([pattern, count]) => ({ pattern, count }));

      const recommendations = this.generateSecurityRecommendations(eventsByType, securityEvents, suspiciousActivity);

      return {
        totalEvents: recentEvents.length,
        eventsByType,
        securityEvents,
        topTools,
        suspiciousActivity,
        recommendations,
      };
    } catch (error) {
      logger.error("Failed to generate audit summary", { error });
      return {
        totalEvents: 0,
        eventsByType: {},
        securityEvents: 0,
        topTools: [],
        suspiciousActivity: [],
        recommendations: ["Error generating audit summary"],
      };
    }
  }

  private async analyzeSecurityPatterns(event: AuditEvent): Promise<void> {
    try {
      // Pattern: Repeated security violations from same source
      if (event.eventType === AuditEventType.SECURITY_VIOLATION && event.security.ipAddress) {
        const patternKey = `repeated_violations:${event.security.ipAddress}`;
        const currentCount = this.suspiciousPatterns.get(patternKey) || 0;
        this.suspiciousPatterns.set(patternKey, currentCount + 1);

        if (currentCount + 1 >= 5) {
          await this.logSuspiciousActivity(`Repeated security violations from IP ${event.security.ipAddress}`, "high", {
            ipAddress: event.security.ipAddress,
            violationCount: currentCount + 1,
          });
        }
      }

      // Pattern: High-frequency tool execution
      if (event.eventType === AuditEventType.TOOL_EXECUTION) {
        const patternKey = `high_frequency:${event.toolName}:${event.sessionId || "unknown"}`;
        const currentCount = this.suspiciousPatterns.get(patternKey) || 0;
        this.suspiciousPatterns.set(patternKey, currentCount + 1);

        if (currentCount + 1 >= 100) {
          // 100 requests from same session/tool
          await this.logSuspiciousActivity("High-frequency tool execution detected", "medium", {
            toolName: event.toolName,
            sessionId: event.sessionId,
            requestCount: currentCount + 1,
          });
        }
      }

      // Pattern: Destructive operations outside business hours
      if (event.operation.operationType === "destructive") {
        const hour = new Date().getHours();
        if (hour < 8 || hour > 18) {
          // Outside 8 AM - 6 PM
          await this.logSuspiciousActivity("Destructive operation outside business hours", "medium", {
            toolName: event.toolName,
            hour,
            operation: event.operation.operation,
          });
        }
      }

      // Pattern: Low security score operations
      if (event.security.securityScore < 3) {
        const patternKey = `low_security_score:${event.toolName}`;
        const currentCount = this.suspiciousPatterns.get(patternKey) || 0;
        this.suspiciousPatterns.set(patternKey, currentCount + 1);
      }

      // Clean up old patterns (keep only last 24 hours of patterns)
      this.cleanupOldPatterns();
    } catch (error) {
      logger.error("Error analyzing security patterns", { error });
    }
  }

  private async getRecentEvents(cutoffTime: Date): Promise<AuditEvent[]> {
    // In a production implementation, this would read from the audit storage
    // For now, return events from the buffer that match the criteria
    return this.auditBuffer.filter((event) => new Date(event.timestamp) >= cutoffTime);
  }

  private generateSecurityRecommendations(
    eventsByType: { [key: string]: number },
    securityEvents: number,
    suspiciousActivity: { pattern: string; count: number }[],
  ): string[] {
    const recommendations: string[] = [];

    if (securityEvents > 10) {
      recommendations.push("High number of security events detected - review security configurations");
    }

    if (eventsByType[AuditEventType.RATE_LIMIT_HIT] > 20) {
      recommendations.push("Frequent rate limiting - consider adjusting rate limits or investigating client behavior");
    }

    if (eventsByType[AuditEventType.CIRCUIT_BREAKER_TRIP] > 5) {
      recommendations.push("Circuit breaker trips detected - investigate Elasticsearch cluster health");
    }

    if (suspiciousActivity.length > 3) {
      recommendations.push("Multiple suspicious patterns detected - enable enhanced monitoring");
    }

    if (eventsByType[AuditEventType.AUTHENTICATION_FAILURE] > 5) {
      recommendations.push("Authentication failures detected - review access credentials and policies");
    }

    if (recommendations.length === 0) {
      recommendations.push("No significant security concerns detected");
    }

    return recommendations;
  }

  private sanitizeParameters(params: any): any {
    if (!params || typeof params !== "object") {
      return params;
    }

    const sensitiveFields = ["password", "token", "key", "secret", "auth", "credential"];
    const sanitized = JSON.parse(JSON.stringify(params));

    const sanitizeObject = (obj: any): void => {
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
          obj[key] = "***REDACTED***";
        } else if (typeof value === "object" && value !== null) {
          sanitizeObject(value);
        }
      }
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  private generateEventId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `audit_${timestamp}_${random}`;
  }

  private isCriticalEvent(event: AuditEvent): boolean {
    return (
      [
        AuditEventType.SECURITY_VIOLATION,
        AuditEventType.SUSPICIOUS_ACTIVITY,
        AuditEventType.AUTHENTICATION_FAILURE,
      ].includes(event.eventType) && event.security.securityScore > 7
    );
  }

  private logToStandardLogger(event: AuditEvent): void {
    const logData = {
      auditEvent: event.id,
      eventType: event.eventType,
      toolName: event.toolName,
      operation: event.operation.operation,
      status: event.result.status,
      duration: event.result.duration,
      securityScore: event.security.securityScore,
    };

    switch (event.eventType) {
      case AuditEventType.SECURITY_VIOLATION:
      case AuditEventType.SUSPICIOUS_ACTIVITY:
        logger.warn("Security audit event", logData);
        break;
      case AuditEventType.ERROR_EVENT:
        logger.error("Error audit event", logData);
        break;
      default:
        if (this.config.logLevel === "detailed") {
          logger.info("Audit event", logData);
        }
        break;
    }
  }

  private async initializeEncryption(): Promise<void> {
    // In production, this would use proper key management
    this.encryptionKey = process.env.AUDIT_ENCRYPTION_KEY || "default-key-change-in-production";
  }

  private startPeriodicFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Flush audit buffer every 30 seconds
    this.flushTimer = setInterval(async () => {
      if (this.auditBuffer.length > 0) {
        await this.flushBuffer();
      }
    }, 30000);
  }

  private async flushBuffer(): Promise<void> {
    if (this.auditBuffer.length === 0) {
      return;
    }

    try {
      const events = [...this.auditBuffer];
      this.auditBuffer = [];

      await this.writeEventsToStorage(events);

      logger.debug("Flushed audit buffer", { eventCount: events.length });
    } catch (error) {
      logger.error("Failed to flush audit buffer", { error });
      // Re-add events to buffer on failure
      this.auditBuffer.unshift(...this.auditBuffer);
    }
  }

  private async writeEventsToStorage(events: AuditEvent[]): Promise<void> {
    const filename = `audit-${new Date().toISOString().split("T")[0]}.log`;
    const filepath = path.join(this.config.storage.directory, filename);

    const logLines = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;

    await fs.appendFile(filepath, logLines, "utf8");
  }

  private cleanupOldPatterns(): void {
    const _cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    for (const [key] of this.suspiciousPatterns) {
      // This is a simplified cleanup - in production, you'd track timestamps per pattern
      if (Math.random() < 0.01) {
        // Randomly clean up 1% of patterns
        this.suspiciousPatterns.delete(key);
      }
    }
  }

  public async cleanup(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    if (this.auditBuffer.length > 0) {
      await this.flushBuffer();
    }

    logger.info("Security audit trail cleanup completed");
  }

  public getConfiguration(): AuditConfiguration {
    return { ...this.config };
  }

  public async rotateEncryptionKey(): Promise<void> {
    if (!this.config.encryption.enabled) {
      return;
    }

    // In production, implement proper key rotation
    logger.info("Encryption key rotation requested (not implemented in demo)");
  }
}
