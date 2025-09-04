/* src/utils/circuitBreaker.ts */

import { logger } from "./logger.js";

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  recoveryTimeout: number; // Time to wait before attempting recovery (ms)
  monitoringPeriod: number; // Time window for failure monitoring (ms)
  successThreshold: number; // Successful calls needed to close circuit
}

export enum CircuitState {
  CLOSED = "closed", // Normal operation
  OPEN = "open", // Blocking requests due to failures
  HALF_OPEN = "half_open", // Testing if service has recovered
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextRetryTime?: number;
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitState,
    public readonly nextRetryTime?: number
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalCalls = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextRetryTime?: number;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {
    logger.debug("Circuit breaker initialized", {
      name: this.name,
      config: this.config,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should reject the call
    if (this.shouldRejectCall()) {
      const waitTime = this.nextRetryTime ? Math.ceil((this.nextRetryTime - Date.now()) / 1000) : 0;
      throw new CircuitBreakerError(
        `Circuit breaker for ${this.name} is ${this.state}. Retry in ${waitTime} seconds.`,
        this.state,
        this.nextRetryTime
      );
    }

    this.totalCalls++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if the call should be rejected
   */
  private shouldRejectCall(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        return false;

      case CircuitState.OPEN:
        if (this.nextRetryTime && now >= this.nextRetryTime) {
          this.state = CircuitState.HALF_OPEN;
          this.successCount = 0;
          logger.info("Circuit breaker transitioning to half-open", {
            name: this.name,
            failureCount: this.failureCount,
          });
          return false;
        }
        return true;

      case CircuitState.HALF_OPEN:
        return false;

      default:
        return false;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();

    switch (this.state) {
      case CircuitState.HALF_OPEN:
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.reset();
          logger.info("Circuit breaker closed after successful recovery", {
            name: this.name,
            successCount: this.successCount,
          });
        }
        break;

      case CircuitState.CLOSED:
        // Reset failure count on successful operation
        if (this.failureCount > 0) {
          this.failureCount = 0;
        }
        break;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        if (this.shouldOpenCircuit()) {
          this.openCircuit();
        }
        break;

      case CircuitState.HALF_OPEN:
        this.openCircuit();
        logger.warn("Circuit breaker re-opened due to failure during recovery", {
          name: this.name,
          failureCount: this.failureCount,
        });
        break;
    }
  }

  /**
   * Check if circuit should be opened
   */
  private shouldOpenCircuit(): boolean {
    const now = Date.now();
    const periodStart = now - this.config.monitoringPeriod;

    // Check if we have enough recent failures
    const recentFailures = this.failureCount;
    const withinMonitoringPeriod = !this.lastFailureTime || this.lastFailureTime >= periodStart;

    return recentFailures >= this.config.failureThreshold && withinMonitoringPeriod;
  }

  /**
   * Open the circuit
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = Date.now() + this.config.recoveryTimeout;

    logger.warn("Circuit breaker opened", {
      name: this.name,
      failureCount: this.failureCount,
      nextRetryTime: new Date(this.nextRetryTime).toISOString(),
    });
  }

  /**
   * Reset circuit breaker to closed state
   */
  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextRetryTime = undefined;
  }

  /**
   * Get current stats
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.nextRetryTime,
    };
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    this.openCircuit();
    logger.info("Circuit breaker manually opened", { name: this.name });
  }

  /**
   * Manually close the circuit
   */
  close(): void {
    this.reset();
    logger.info("Circuit breaker manually closed", { name: this.name });
  }

  /**
   * Get health status
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED;
  }
}

// Global circuit breakers registry
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Create or get a circuit breaker
 */
export function getOrCreateCircuitBreaker(
  name: string,
  config: CircuitBreakerConfig
): CircuitBreaker {
  let breaker = circuitBreakers.get(name);
  
  if (!breaker) {
    breaker = new CircuitBreaker(name, config);
    circuitBreakers.set(name, breaker);
    logger.info("Created new circuit breaker", { name, config });
  }
  
  return breaker;
}

/**
 * Get existing circuit breaker
 */
export function getCircuitBreaker(name: string): CircuitBreaker | undefined {
  return circuitBreakers.get(name);
}

/**
 * Get all circuit breaker stats
 */
export function getAllCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  
  for (const [name, breaker] of circuitBreakers) {
    stats[name] = breaker.getStats();
  }
  
  return stats;
}

/**
 * Wrapper function to add circuit breaker protection
 */
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  name: string,
  operation: T,
  config?: Partial<CircuitBreakerConfig>
): T {
  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 5, // Open after 5 failures
    recoveryTimeout: 30000, // Wait 30 seconds before retry
    monitoringPeriod: 60000, // Monitor failures over 1 minute
    successThreshold: 3, // Need 3 successes to close
  };

  const finalConfig = { ...defaultConfig, ...config };
  const circuitBreaker = getOrCreateCircuitBreaker(name, finalConfig);

  return (async (...args: any[]) => {
    return await circuitBreaker.execute(() => operation(...args));
  }) as T;
}

/**
 * Circuit breaker for Elasticsearch operations
 */
export function withElasticsearchCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  operationName: string,
  operation: T
): T {
  return withCircuitBreaker(`elasticsearch_${operationName}`, operation, {
    failureThreshold: 3, // More sensitive for ES operations
    recoveryTimeout: 15000, // Faster recovery for database operations
    monitoringPeriod: 30000, // Shorter monitoring period
    successThreshold: 2, // Fewer successes needed
  });
}

/**
 * Initialize default circuit breakers for common operations
 */
export function initializeDefaultCircuitBreakers(): void {
  const commonOperations = [
    "search",
    "index",
    "update",
    "delete",
    "bulk",
    "cluster_health",
    "indices_list",
  ];

  for (const operation of commonOperations) {
    getOrCreateCircuitBreaker(`elasticsearch_${operation}`, {
      failureThreshold: 5,
      recoveryTimeout: 20000,
      monitoringPeriod: 60000,
      successThreshold: 3,
    });
  }

  logger.info("Default circuit breakers initialized", {
    operations: commonOperations,
    count: commonOperations.length,
  });
}