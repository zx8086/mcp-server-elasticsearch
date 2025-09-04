/* src/utils/rateLimiter.ts */

import { logger } from "./logger.js";

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (context: any) => string; // Custom key generator
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private config: RateLimitConfig) {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Check if request should be rate limited
   */
  checkLimit(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - (now % this.config.windowMs);
    const resetTime = windowStart + this.config.windowMs;

    let entry = this.store.get(key);

    // Create new entry or reset if window expired
    if (!entry || entry.resetTime <= now) {
      entry = {
        count: 0,
        resetTime,
      };
    }

    // Increment request count
    entry.count++;
    this.store.set(key, entry);

    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    const allowed = entry.count <= this.config.maxRequests;

    const result: RateLimitResult = {
      allowed,
      remaining,
      resetTime,
    };

    if (!allowed) {
      result.retryAfter = Math.ceil((resetTime - now) / 1000);
    }

    return result;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug("Rate limiter cleanup completed", { cleanedCount });
    }
  }

  /**
   * Get current stats
   */
  getStats(): { activeKeys: number; totalSize: number } {
    return {
      activeKeys: this.store.size,
      totalSize: this.store.size,
    };
  }

  /**
   * Destroy rate limiter and cleanup
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Global rate limiters
let globalToolRateLimiter: RateLimiter;
let globalConnectionRateLimiter: RateLimiter;

/**
 * Initialize global rate limiters
 */
export function initializeRateLimiters(config: {
  toolLimits: RateLimitConfig;
  connectionLimits: RateLimitConfig;
}): void {
  // Clean up existing limiters
  if (globalToolRateLimiter) {
    globalToolRateLimiter.destroy();
  }
  if (globalConnectionRateLimiter) {
    globalConnectionRateLimiter.destroy();
  }

  // Create new limiters
  globalToolRateLimiter = new RateLimiter(config.toolLimits);
  globalConnectionRateLimiter = new RateLimiter(config.connectionLimits);

  logger.info("Rate limiters initialized", {
    toolLimits: `${config.toolLimits.maxRequests} requests per ${config.toolLimits.windowMs}ms`,
    connectionLimits: `${config.connectionLimits.maxRequests} connections per ${config.connectionLimits.windowMs}ms`,
  });
}

/**
 * Get tool rate limiter
 */
export function getToolRateLimiter(): RateLimiter {
  if (!globalToolRateLimiter) {
    // Create default limiter if not initialized
    globalToolRateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 100, // 100 requests per minute
    });
    logger.warn("Using default tool rate limiter - consider calling initializeRateLimiters()");
  }
  return globalToolRateLimiter;
}

/**
 * Get connection rate limiter
 */
export function getConnectionRateLimiter(): RateLimiter {
  if (!globalConnectionRateLimiter) {
    // Create default limiter if not initialized
    globalConnectionRateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 10, // 10 connections per minute
    });
    logger.warn("Using default connection rate limiter - consider calling initializeRateLimiters()");
  }
  return globalConnectionRateLimiter;
}

/**
 * Rate limit wrapper for tool handlers
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  toolName: string,
  handler: T,
  keyGenerator: (args: any[]) => string = () => "default"
): T {
  return (async (...args: any[]) => {
    const limiter = getToolRateLimiter();
    const key = `${toolName}:${keyGenerator(args)}`;
    
    const result = limiter.checkLimit(key);
    
    if (!result.allowed) {
      logger.warn("Rate limit exceeded", {
        toolName,
        key,
        retryAfter: result.retryAfter,
        resetTime: new Date(result.resetTime).toISOString(),
      });
      
      throw new Error(
        `Rate limit exceeded for ${toolName}. Try again in ${result.retryAfter} seconds.`
      );
    }

    logger.debug("Rate limit check passed", {
      toolName,
      remaining: result.remaining,
      resetTime: new Date(result.resetTime).toISOString(),
    });

    return await handler(...args);
  }) as T;
}

/**
 * Memory usage monitor and limiter
 */
export class ResourceMonitor {
  private memoryThreshold: number;
  private checkInterval: NodeJS.Timeout;
  private lastMemoryWarning = 0;

  constructor(memoryThresholdMB = 1000) {
    this.memoryThreshold = memoryThresholdMB * 1024 * 1024; // Convert MB to bytes
    
    // Check memory every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30000);

    logger.info("Resource monitor initialized", {
      memoryThresholdMB,
      checkInterval: "30 seconds",
    });
  }

  /**
   * Check current memory usage
   */
  private checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const now = Date.now();

    if (usage.heapUsed > this.memoryThreshold) {
      // Only log warning once per minute to avoid spam
      if (now - this.lastMemoryWarning > 60000) {
        logger.warn("High memory usage detected", {
          heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
          thresholdMB: Math.round(this.memoryThreshold / 1024 / 1024),
          heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
          rss: Math.round(usage.rss / 1024 / 1024),
        });
        this.lastMemoryWarning = now;

        // Force garbage collection if available
        if (global.gc) {
          logger.debug("Forcing garbage collection");
          global.gc();
        }
      }
    }
  }

  /**
   * Check if system resources are available
   */
  checkResourceAvailability(): { available: boolean; reason?: string } {
    const usage = process.memoryUsage();

    if (usage.heapUsed > this.memoryThreshold * 1.2) {
      return {
        available: false,
        reason: `Memory usage too high: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      };
    }

    return { available: true };
  }

  /**
   * Get resource stats
   */
  getStats(): {
    memory: NodeJS.MemoryUsage;
    memoryThresholdMB: number;
    uptime: number;
  } {
    return {
      memory: process.memoryUsage(),
      memoryThresholdMB: Math.round(this.memoryThreshold / 1024 / 1024),
      uptime: process.uptime(),
    };
  }

  /**
   * Destroy resource monitor
   */
  destroy(): void {
    clearInterval(this.checkInterval);
  }
}

// Global resource monitor
let globalResourceMonitor: ResourceMonitor;

/**
 * Initialize global resource monitor
 */
export function initializeResourceMonitor(memoryThresholdMB = 1000): ResourceMonitor {
  if (globalResourceMonitor) {
    globalResourceMonitor.destroy();
  }
  
  globalResourceMonitor = new ResourceMonitor(memoryThresholdMB);
  return globalResourceMonitor;
}

/**
 * Get global resource monitor
 */
export function getResourceMonitor(): ResourceMonitor {
  if (!globalResourceMonitor) {
    globalResourceMonitor = new ResourceMonitor();
    logger.warn("Using default resource monitor - consider calling initializeResourceMonitor()");
  }
  return globalResourceMonitor;
}