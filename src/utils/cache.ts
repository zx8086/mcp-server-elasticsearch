/* src/utils/cache.ts */

import { logger } from "./logger.js";

export interface CacheConfig {
  maxSize: number;     // Maximum number of entries
  ttlMs: number;       // Time to live in milliseconds
  cleanupIntervalMs: number; // Cleanup interval
}

interface CacheEntry<T> {
  value: T;
  expires: number;
  hits: number;
  lastAccess: number;
}

interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  totalEntries: number;
}

export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder = new Map<string, number>();
  private accessCounter = 0;
  private cleanupTimer: NodeJS.Timeout;

  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalEntries: 0,
  };

  constructor(private config: CacheConfig) {
    // Set up periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, config.cleanupIntervalMs);

    logger.debug("LRU Cache initialized", {
      maxSize: config.maxSize,
      ttlMs: config.ttlMs,
      cleanupIntervalMs: config.cleanupIntervalMs,
    });
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (entry.expires <= now) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access statistics
    entry.hits++;
    entry.lastAccess = now;
    this.accessOrder.set(key, this.accessCounter++);
    this.stats.hits++;

    logger.debug("Cache hit", {
      key: this.sanitizeKey(key),
      hits: entry.hits,
      age: now - (entry.expires - this.config.ttlMs),
    });

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, customTtlMs?: number): void {
    const now = Date.now();
    const ttl = customTtlMs ?? this.config.ttlMs;
    const expires = now + ttl;

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      expires,
      hits: 0,
      lastAccess: now,
    };

    this.cache.set(key, entry);
    this.accessOrder.set(key, this.accessCounter++);
    this.stats.totalEntries++;

    logger.debug("Cache set", {
      key: this.sanitizeKey(key),
      ttl,
      size: this.cache.size,
      maxSize: this.config.maxSize,
    });
  }

  /**
   * Get or set value with factory function
   */
  async getOrSet<R extends T>(
    key: string,
    factory: () => Promise<R>,
    customTtlMs?: number
  ): Promise<R> {
    let value = this.get(key) as R;
    
    if (value !== undefined) {
      return value;
    }

    // Cache miss - generate value
    logger.debug("Cache miss - generating value", {
      key: this.sanitizeKey(key),
    });

    try {
      value = await factory();
      this.set(key, value, customTtlMs);
      return value;
    } catch (error) {
      logger.warn("Failed to generate cache value", {
        key: this.sanitizeKey(key),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    if (entry.expires <= now) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.accessOrder.delete(key);
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
    
    logger.debug("Cache cleared", { previousSize: size });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      evictions: this.stats.evictions,
      totalEntries: this.stats.totalEntries,
    };
  }

  /**
   * Get cache keys (for debugging)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;

    // Find the least recently used key
    let lruKey: string | undefined;
    let lruAccess = Infinity;

    for (const [key, access] of this.accessOrder) {
      if (access < lruAccess) {
        lruAccess = access;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
      this.stats.evictions++;

      logger.debug("Evicted LRU entry", {
        key: this.sanitizeKey(lruKey),
        access: lruAccess,
        newSize: this.cache.size,
      });
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache) {
      if (entry.expires <= now) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.debug("Cache cleanup completed", {
        expiredEntries: expiredCount,
        remainingEntries: this.cache.size,
      });
    }
  }

  /**
   * Sanitize cache key for logging (remove sensitive data)
   */
  private sanitizeKey(key: string): string {
    // Remove potential sensitive data from keys for logging
    return key.length > 100 ? `${key.substring(0, 97)}...` : key;
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.clear();
    logger.debug("Cache destroyed");
  }
}

// Cache implementations for different types of data
export class QueryCache extends LRUCache<any> {
  constructor() {
    super({
      maxSize: 1000,         // Store up to 1000 query results
      ttlMs: 5 * 60 * 1000,  // 5 minutes TTL
      cleanupIntervalMs: 60 * 1000, // Cleanup every minute
    });
  }

  /**
   * Generate cache key for search queries
   */
  static generateQueryKey(index: string, query: any, params: any = {}): string {
    const queryStr = JSON.stringify(query);
    const paramsStr = JSON.stringify(params);
    return `query:${index}:${Buffer.from(queryStr + paramsStr).toString('base64')}`;
  }
}

export class MappingCache extends LRUCache<any> {
  constructor() {
    super({
      maxSize: 500,          // Store up to 500 mapping definitions
      ttlMs: 30 * 60 * 1000, // 30 minutes TTL (mappings change infrequently)
      cleanupIntervalMs: 5 * 60 * 1000, // Cleanup every 5 minutes
    });
  }

  /**
   * Generate cache key for mappings
   */
  static generateMappingKey(index: string): string {
    return `mapping:${index}`;
  }
}

export class SettingsCache extends LRUCache<any> {
  constructor() {
    super({
      maxSize: 500,          // Store up to 500 settings
      ttlMs: 15 * 60 * 1000, // 15 minutes TTL
      cleanupIntervalMs: 5 * 60 * 1000, // Cleanup every 5 minutes
    });
  }

  /**
   * Generate cache key for settings
   */
  static generateSettingsKey(index: string): string {
    return `settings:${index}`;
  }
}

export class ClusterInfoCache extends LRUCache<any> {
  constructor() {
    super({
      maxSize: 50,           // Small cache for cluster info
      ttlMs: 2 * 60 * 1000,  // 2 minutes TTL (cluster info changes frequently)
      cleanupIntervalMs: 60 * 1000, // Cleanup every minute
    });
  }

  /**
   * Generate cache key for cluster information
   */
  static generateClusterKey(endpoint: string): string {
    return `cluster:${endpoint}`;
  }
}

// Global cache instances
let globalQueryCache: QueryCache;
let globalMappingCache: MappingCache;
let globalSettingsCache: SettingsCache;
let globalClusterInfoCache: ClusterInfoCache;

/**
 * Initialize global cache instances
 */
export function initializeCaches(): void {
  // Destroy existing caches if they exist
  if (globalQueryCache) globalQueryCache.destroy();
  if (globalMappingCache) globalMappingCache.destroy();
  if (globalSettingsCache) globalSettingsCache.destroy();
  if (globalClusterInfoCache) globalClusterInfoCache.destroy();

  // Create new cache instances
  globalQueryCache = new QueryCache();
  globalMappingCache = new MappingCache();
  globalSettingsCache = new SettingsCache();
  globalClusterInfoCache = new ClusterInfoCache();

  logger.info("Global caches initialized", {
    queryCache: globalQueryCache.getStats(),
    mappingCache: globalMappingCache.getStats(),
    settingsCache: globalSettingsCache.getStats(),
    clusterInfoCache: globalClusterInfoCache.getStats(),
  });
}

/**
 * Get global cache instances
 */
export function getQueryCache(): QueryCache {
  if (!globalQueryCache) {
    initializeCaches();
  }
  return globalQueryCache;
}

export function getMappingCache(): MappingCache {
  if (!globalMappingCache) {
    initializeCaches();
  }
  return globalMappingCache;
}

export function getSettingsCache(): SettingsCache {
  if (!globalSettingsCache) {
    initializeCaches();
  }
  return globalSettingsCache;
}

export function getClusterInfoCache(): ClusterInfoCache {
  if (!globalClusterInfoCache) {
    initializeCaches();
  }
  return globalClusterInfoCache;
}

/**
 * Get all cache statistics
 */
export function getAllCacheStats(): Record<string, CacheStats> {
  return {
    query: getQueryCache().getStats(),
    mapping: getMappingCache().getStats(),
    settings: getSettingsCache().getStats(),
    clusterInfo: getClusterInfoCache().getStats(),
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  getQueryCache().clear();
  getMappingCache().clear();
  getSettingsCache().clear();
  getClusterInfoCache().clear();
  
  logger.info("All caches cleared");
}

/**
 * Destroy all caches
 */
export function destroyAllCaches(): void {
  if (globalQueryCache) globalQueryCache.destroy();
  if (globalMappingCache) globalMappingCache.destroy();
  if (globalSettingsCache) globalSettingsCache.destroy();
  if (globalClusterInfoCache) globalClusterInfoCache.destroy();
  
  logger.info("All caches destroyed");
}