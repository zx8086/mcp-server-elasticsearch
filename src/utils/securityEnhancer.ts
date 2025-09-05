/* src/utils/securityEnhancer.ts */

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./logger.js";

/**
 * Production-ready security enhancements for MCP server
 * Provides:
 * - Input sanitization and validation
 * - SQL/NoSQL injection detection
 * - XSS protection
 * - Command injection prevention
 * - Data size limits
 * - Sensitive data redaction
 * - IP-based access control (for SSE mode)
 */

interface SecurityConfig {
  maxInputSize: number;
  enableInjectionDetection: boolean;
  enableXssProtection: boolean;
  enableCommandInjectionProtection: boolean;
  allowedIpRanges?: string[];
  sensitiveFields: string[];
  maxQueryComplexity: number;
}

interface SecurityViolation {
  type: "injection" | "xss" | "command_injection" | "size_limit" | "complexity" | "access_denied";
  field?: string;
  value?: string;
  severity: "low" | "medium" | "high" | "critical";
  blocked: boolean;
}

export class SecurityEnhancer {
  private config: SecurityConfig;
  private suspiciousPatterns: Map<string, RegExp[]>;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      maxInputSize: 1024 * 1024, // 1MB
      enableInjectionDetection: true,
      enableXssProtection: true,
      enableCommandInjectionProtection: true,
      sensitiveFields: ["password", "api_key", "apiKey", "secret", "token", "auth"],
      maxQueryComplexity: 100,
      ...config,
    };

    this.initializeSuspiciousPatterns();
  }

  private initializeSuspiciousPatterns(): void {
    this.suspiciousPatterns = new Map([
      [
        "sql_injection",
        [
          /(\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE)\b)/gi,
          /(UNION\s+SELECT|OR\s+1\s*=\s*1|'.*OR.*'|".*OR.*")/gi,
          /(;\s*(DROP|DELETE|TRUNCATE|ALTER))/gi,
          /('|"|\||%|;|--|\||&&|\|\|)/g,
        ],
      ],
      [
        "nosql_injection",
        [
          /(\$where|\$ne|\$gt|\$lt|\$gte|\$lte|\$in|\$nin|\$exists|\$regex)/gi,
          /({"?\$[a-z]+":?\s*{)/gi,
          /(\$\$|\$function|\$accumulator)/gi,
        ],
      ],
      [
        "xss",
        [
          /<script[^>]*>.*?<\/script>/gi,
          /<iframe[^>]*>.*?<\/iframe>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi,
          /<[^>]+on\w+="[^"]*"/gi,
        ],
      ],
      [
        "command_injection",
        [
          /(\||&&|;|`|\$\(|\$\{)/g,
          /(nc|netcat|wget|curl|bash|sh|cmd|powershell)/gi,
          /(>|<|>>|<<|\|)/g,
          /(\.\.|\/etc\/|\/bin\/|\/usr\/)/gi,
        ],
      ],
      ["path_traversal", [/(\.\.\/)|(\.\.\\)/g, /(%2e%2e%2f)|(%2e%2e%5c)/gi, /(\/etc\/|\/bin\/|\/usr\/|\/var\/)/gi]],
    ]);
  }

  /**
   * Comprehensive input validation and sanitization
   */
  validateAndSanitizeInput(
    toolName: string,
    input: any,
  ): {
    sanitized: any;
    violations: SecurityViolation[];
  } {
    const violations: SecurityViolation[] = [];
    const sanitized = this.deepClone(input);

    try {
      // Size check
      const inputSize = JSON.stringify(input).length;
      if (inputSize > this.config.maxInputSize) {
        violations.push({
          type: "size_limit",
          severity: "high",
          blocked: true,
        });

        logger.warn("Input size exceeds limit", {
          tool: toolName,
          size: inputSize,
          limit: this.config.maxInputSize,
        });

        throw new McpError(
          ErrorCode.InvalidParams,
          `Input size (${inputSize} bytes) exceeds maximum allowed size (${this.config.maxInputSize} bytes)`,
        );
      }

      // Recursive validation and sanitization
      this.processObject(sanitized, violations, toolName);

      // Query complexity check for search operations
      if (toolName.includes("search") && this.config.maxQueryComplexity > 0) {
        const complexity = this.calculateQueryComplexity(sanitized);
        if (complexity > this.config.maxQueryComplexity) {
          violations.push({
            type: "complexity",
            severity: "medium",
            blocked: true,
          });

          throw new McpError(
            ErrorCode.InvalidParams,
            `Query complexity (${complexity}) exceeds maximum allowed (${this.config.maxQueryComplexity})`,
          );
        }
      }

      // Log security violations
      if (violations.length > 0) {
        const criticalViolations = violations.filter((v) => v.severity === "critical" || v.blocked);
        if (criticalViolations.length > 0) {
          logger.error("Critical security violations detected", {
            tool: toolName,
            violations: criticalViolations,
            input: this.redactSensitiveData(input),
          });
        } else {
          logger.warn("Security violations detected but allowed", {
            tool: toolName,
            violations,
            input: this.redactSensitiveData(input),
          });
        }
      }

      return { sanitized, violations };
    } catch (error) {
      logger.error("Security validation failed", {
        tool: toolName,
        error: error instanceof Error ? error.message : String(error),
        input: this.redactSensitiveData(input),
      });
      throw error;
    }
  }

  private processObject(obj: any, violations: SecurityViolation[], toolName: string, path = ""): void {
    if (obj === null || obj === undefined) return;

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.processObject(item, violations, toolName, `${path}[${index}]`);
      });
      return;
    }

    if (typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Check for sensitive fields
        if (this.isSensitiveField(key) && typeof value === "string") {
          obj[key] = this.redactValue(value);
          continue;
        }

        this.processObject(value, violations, toolName, currentPath);
      }
      return;
    }

    if (typeof obj === "string") {
      const stringViolations = this.validateString(obj, path);
      violations.push(...stringViolations);

      // Block critical violations
      const criticalViolations = stringViolations.filter((v) => v.severity === "critical");
      if (criticalViolations.length > 0) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Security violation detected in field ${path}: ${criticalViolations[0].type}`,
        );
      }
    }
  }

  private validateString(value: string, field: string): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Check each pattern category
    for (const [category, patterns] of this.suspiciousPatterns.entries()) {
      for (const pattern of patterns) {
        if (pattern.test(value)) {
          const severity = this.getSeverityForCategory(category);

          violations.push({
            type: this.mapCategoryToType(category),
            field,
            value: this.truncateValue(value),
            severity,
            blocked: severity === "critical",
          });

          // Reset regex index for global patterns
          pattern.lastIndex = 0;
        }
      }
    }

    return violations;
  }

  private getSeverityForCategory(category: string): "low" | "medium" | "high" | "critical" {
    switch (category) {
      case "sql_injection":
      case "command_injection":
        return "critical";
      case "nosql_injection":
      case "path_traversal":
        return "high";
      case "xss":
        return "medium";
      default:
        return "low";
    }
  }

  private mapCategoryToType(category: string): SecurityViolation["type"] {
    switch (category) {
      case "sql_injection":
      case "nosql_injection":
      case "path_traversal":
        return "injection";
      case "xss":
        return "xss";
      case "command_injection":
        return "command_injection";
      default:
        return "injection";
    }
  }

  private calculateQueryComplexity(query: any): number {
    if (typeof query !== "object" || query === null) return 1;

    let complexity = 0;

    const traverse = (obj: any, depth = 0): void => {
      if (depth > 10) return; // Prevent infinite recursion

      if (Array.isArray(obj)) {
        complexity += obj.length;
        obj.forEach((item) => traverse(item, depth + 1));
      } else if (typeof obj === "object") {
        complexity += Object.keys(obj).length;
        Object.values(obj).forEach((value) => traverse(value, depth + 1));
      } else {
        complexity += 1;
      }
    };

    traverse(query);
    return complexity;
  }

  private isSensitiveField(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return this.config.sensitiveFields.some((sensitive) => lowerFieldName.includes(sensitive.toLowerCase()));
  }

  private redactValue(value: string): string {
    if (value.length <= 4) return "***";
    return value.substring(0, 2) + "*".repeat(value.length - 4) + value.substring(value.length - 2);
  }

  private truncateValue(value: string): string {
    return value.length > 100 ? `${value.substring(0, 100)}...` : value;
  }

  /**
   * Redact sensitive data from logs
   */
  redactSensitiveData(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    const redacted = this.deepClone(obj);

    const traverse = (current: any): void => {
      if (Array.isArray(current)) {
        current.forEach(traverse);
      } else if (typeof current === "object") {
        for (const [key, value] of Object.entries(current)) {
          if (this.isSensitiveField(key) && typeof value === "string") {
            current[key] = this.redactValue(value);
          } else {
            traverse(value);
          }
        }
      }
    };

    traverse(redacted);
    return redacted;
  }

  /**
   * IP-based access control (for SSE mode)
   */
  validateIpAccess(clientIp: string): boolean {
    if (!this.config.allowedIpRanges || this.config.allowedIpRanges.length === 0) {
      return true; // No restrictions
    }

    // Simple IP range check (could be enhanced with proper CIDR support)
    for (const allowedRange of this.config.allowedIpRanges) {
      if (clientIp.startsWith(allowedRange) || allowedRange === "*") {
        return true;
      }
    }

    logger.warn("IP access denied", { clientIp, allowedRanges: this.config.allowedIpRanges });
    return false;
  }

  /**
   * Generate security headers for HTTP responses
   */
  getSecurityHeaders(): Record<string, string> {
    return {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'none'; connect-src 'self'",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    };
  }

  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== "object") return obj;
    if (obj instanceof Date) return new Date(obj);
    if (Array.isArray(obj)) return obj.map(this.deepClone.bind(this));

    const cloned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      cloned[key] = this.deepClone(value);
    }
    return cloned;
  }
}

// Create default security enhancer instance
export const defaultSecurityEnhancer = new SecurityEnhancer();

// Security wrapper for tool handlers
export function withSecurityValidation<_T extends any[], R>(
  toolName: string,
  toolFunction: (args: any) => Promise<R>,
  securityConfig?: Partial<SecurityConfig>,
) {
  const enhancer = securityConfig ? new SecurityEnhancer(securityConfig) : defaultSecurityEnhancer;

  return async (args: any): Promise<R> => {
    const { sanitized, violations } = enhancer.validateAndSanitizeInput(toolName, args);

    // Log security metrics
    logger.debug("Security validation completed", {
      tool: toolName,
      violationCount: violations.length,
      blocked: violations.some((v) => v.blocked),
    });

    return toolFunction(sanitized);
  };
}
