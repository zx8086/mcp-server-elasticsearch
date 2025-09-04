import { LRUCache } from 'lru-cache';
import { logger } from './logger.js';
import { metrics } from '../monitoring/prometheusMetrics.js';

interface CacheUsagePattern {
  key: string;
  accessCount: number;
  lastAccessed: number;
  averageAccessInterval: number;
  predictedNextAccess: number;
  category: string;
  score: number;
}

interface CachePreference {
  toolName: string;
  patterns: string[];
  priority: number;
  ttl: number;
}

interface IntelligentCacheOptions {
  maxSize: number;
  defaultTtl: number;
  analysisInterval: number;
  prefetchThreshold: number;
  patternRecognitionWindow: number;
}

export class IntelligentCache {
  private cache: LRUCache<string, any>;
  private usagePatterns: Map<string, CacheUsagePattern> = new Map();
  private accessHistory: Array<{ key: string; timestamp: number; toolName?: string }> = [];
  private prefetchQueue: Set<string> = new Set();
  private toolPreferences: Map<string, CachePreference> = new Map();
  private analysisTimer: Timer | null = null;
  private options: IntelligentCacheOptions;

  constructor(options: Partial<IntelligentCacheOptions> = {}) {
    this.options = {
      maxSize: options.maxSize || 1000,
      defaultTtl: options.defaultTtl || 5 * 60 * 1000, // 5 minutes
      analysisInterval: options.analysisInterval || 60 * 1000, // 1 minute
      prefetchThreshold: options.prefetchThreshold || 0.8,
      patternRecognitionWindow: options.patternRecognitionWindow || 24 * 60 * 60 * 1000, // 24 hours
      ...options,
    };

    this.cache = new LRUCache({
      max: this.options.maxSize,
      ttl: this.options.defaultTtl,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      dispose: (value, key) => {
        this.handleCacheEviction(key, value);
      },
    });

    this.initializeToolPreferences();
    this.startPatternAnalysis();
  }

  private initializeToolPreferences(): void {
    // Define caching preferences for different tool categories
    this.toolPreferences.set('search', {
      toolName: 'search',
      patterns: ['query:*', 'index:*'],
      priority: 9, // High priority for search operations
      ttl: 5 * 60 * 1000, // 5 minutes
    });

    this.toolPreferences.set('list_indices', {
      toolName: 'list_indices',
      patterns: ['indices:*'],
      priority: 7,
      ttl: 30 * 60 * 1000, // 30 minutes - indices don't change often
    });

    this.toolPreferences.set('get_mappings', {
      toolName: 'get_mappings',
      patterns: ['mappings:*'],
      priority: 8,
      ttl: 60 * 60 * 1000, // 1 hour - mappings are relatively stable
    });

    this.toolPreferences.set('cluster_health', {
      toolName: 'cluster_health',
      patterns: ['cluster:health'],
      priority: 6,
      ttl: 30 * 1000, // 30 seconds - health changes frequently
    });

    this.toolPreferences.set('get_aliases', {
      toolName: 'get_aliases',
      patterns: ['aliases:*'],
      priority: 5,
      ttl: 60 * 60 * 1000, // 1 hour - aliases don't change often
    });
  }

  public async get(key: string, toolName?: string): Promise<any> {
    const startTime = performance.now();
    
    try {
      const value = this.cache.get(key);
      const duration = performance.now() - startTime;
      
      if (value !== undefined) {
        // Cache hit - record usage pattern
        this.recordAccess(key, true, toolName);
        
        if (metrics.isEnabled()) {
          metrics.recordCacheOperation(this.getCacheType(key), 'hit');
        }
        
        logger.debug('IntelligentCache hit', { 
          key: this.sanitizeKey(key), 
          toolName, 
          duration: `${duration.toFixed(2)}ms` 
        });
        
        return value;
      } else {
        // Cache miss - record and potentially prefetch
        this.recordAccess(key, false, toolName);
        
        if (metrics.isEnabled()) {
          metrics.recordCacheOperation(this.getCacheType(key), 'miss');
        }
        
        logger.debug('IntelligentCache miss', { 
          key: this.sanitizeKey(key), 
          toolName, 
          duration: `${duration.toFixed(2)}ms` 
        });
        
        // Trigger prefetch analysis
        this.schedulePrefetchAnalysis(key, toolName);
        
        return undefined;
      }
    } catch (error) {
      logger.error('IntelligentCache get error', { error, key: this.sanitizeKey(key) });
      return undefined;
    }
  }

  public set(key: string, value: any, ttl?: number, toolName?: string): void {
    try {
      const effectiveTtl = this.calculateOptimalTtl(key, ttl, toolName);
      
      this.cache.set(key, value, { ttl: effectiveTtl });
      
      if (metrics.isEnabled()) {
        metrics.recordCacheOperation(this.getCacheType(key), 'set');
        const currentSize = this.cache.size;
        metrics.updateCacheMetrics(this.getCacheType(key), currentSize, this.getHitRatio());
      }
      
      logger.debug('IntelligentCache set', { 
        key: this.sanitizeKey(key), 
        ttl: effectiveTtl,
        toolName,
        size: this.cache.size 
      });
      
      // Update usage pattern for successful set
      this.updateUsagePattern(key, toolName);
      
    } catch (error) {
      logger.error('IntelligentCache set error', { error, key: this.sanitizeKey(key) });
    }
  }

  public delete(key: string): boolean {
    try {
      const deleted = this.cache.delete(key);
      
      if (deleted) {
        // Remove from usage patterns
        this.usagePatterns.delete(key);
        this.prefetchQueue.delete(key);
        
        if (metrics.isEnabled()) {
          metrics.recordCacheOperation(this.getCacheType(key), 'delete');
        }
        
        logger.debug('IntelligentCache delete', { key: this.sanitizeKey(key) });
      }
      
      return deleted;
    } catch (error) {
      logger.error('IntelligentCache delete error', { error, key: this.sanitizeKey(key) });
      return false;
    }
  }

  public clear(): void {
    try {
      this.cache.clear();
      this.usagePatterns.clear();
      this.prefetchQueue.clear();
      this.accessHistory = [];
      
      if (metrics.isEnabled()) {
        metrics.recordCacheOperation('all', 'clear');
      }
      
      logger.info('IntelligentCache cleared');
    } catch (error) {
      logger.error('IntelligentCache clear error', { error });
    }
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public size(): number {
    return this.cache.size;
  }

  public getStats(): {
    size: number;
    hitRatio: number;
    patterns: number;
    prefetchQueue: number;
    topPatterns: CacheUsagePattern[];
    categoryBreakdown: { [category: string]: number };
  } {
    const topPatterns = Array.from(this.usagePatterns.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const categoryBreakdown: { [category: string]: number } = {};
    for (const pattern of this.usagePatterns.values()) {
      categoryBreakdown[pattern.category] = (categoryBreakdown[pattern.category] || 0) + 1;
    }

    return {
      size: this.cache.size,
      hitRatio: this.getHitRatio(),
      patterns: this.usagePatterns.size,
      prefetchQueue: this.prefetchQueue.size,
      topPatterns,
      categoryBreakdown,
    };
  }

  private recordAccess(key: string, hit: boolean, toolName?: string): void {
    const timestamp = Date.now();
    
    // Add to access history
    this.accessHistory.push({ key, timestamp, toolName });
    
    // Cleanup old history (keep only within pattern recognition window)
    const cutoff = timestamp - this.options.patternRecognitionWindow;
    this.accessHistory = this.accessHistory.filter(entry => entry.timestamp > cutoff);
    
    // Update or create usage pattern
    let pattern = this.usagePatterns.get(key);
    if (!pattern) {
      pattern = {
        key,
        accessCount: 0,
        lastAccessed: timestamp,
        averageAccessInterval: 0,
        predictedNextAccess: 0,
        category: this.categorizeKey(key, toolName),
        score: 0,
      };
      this.usagePatterns.set(key, pattern);
    }
    
    // Update pattern statistics
    const timeSinceLastAccess = timestamp - pattern.lastAccessed;
    pattern.accessCount++;
    pattern.lastAccessed = timestamp;
    
    if (pattern.accessCount > 1) {
      // Calculate moving average of access intervals
      pattern.averageAccessInterval = 
        (pattern.averageAccessInterval * 0.8) + (timeSinceLastAccess * 0.2);
      
      // Predict next access time
      pattern.predictedNextAccess = timestamp + pattern.averageAccessInterval;
      
      // Calculate usage score (higher = more valuable to cache)
      pattern.score = this.calculateUsageScore(pattern, toolName);
    }
  }

  private calculateUsageScore(pattern: CacheUsagePattern, toolName?: string): number {
    const now = Date.now();
    const recency = Math.max(0, 1 - (now - pattern.lastAccessed) / (24 * 60 * 60 * 1000));
    const frequency = Math.min(1, pattern.accessCount / 100); // Normalize to 0-1
    const predictability = pattern.averageAccessInterval > 0 ? 
      Math.max(0, 1 - Math.abs(now - pattern.predictedNextAccess) / pattern.averageAccessInterval) : 0;
    
    // Get tool priority bonus
    const toolPreference = toolName ? this.toolPreferences.get(toolName) : null;
    const priorityBonus = toolPreference ? toolPreference.priority / 10 : 0.5;
    
    // Weighted score
    return (recency * 0.3) + (frequency * 0.4) + (predictability * 0.2) + (priorityBonus * 0.1);
  }

  private calculateOptimalTtl(key: string, requestedTtl?: number, toolName?: string): number {
    if (requestedTtl) {
      return requestedTtl;
    }
    
    // Check tool preferences
    const toolPreference = toolName ? this.toolPreferences.get(toolName) : null;
    if (toolPreference) {
      return toolPreference.ttl;
    }
    
    // Check usage patterns
    const pattern = this.usagePatterns.get(key);
    if (pattern && pattern.averageAccessInterval > 0) {
      // Set TTL to 2x average access interval, capped at 1 hour
      return Math.min(pattern.averageAccessInterval * 2, 60 * 60 * 1000);
    }
    
    return this.options.defaultTtl;
  }

  private categorizeKey(key: string, toolName?: string): string {
    if (toolName) {
      return toolName;
    }
    
    // Categorize by key pattern
    if (key.includes('search:') || key.includes('query:')) return 'search';
    if (key.includes('indices:') || key.includes('index:')) return 'indices';
    if (key.includes('mappings:')) return 'mappings';
    if (key.includes('cluster:')) return 'cluster';
    if (key.includes('aliases:')) return 'aliases';
    
    return 'unknown';
  }

  private getCacheType(key: string): string {
    const category = this.categorizeKey(key);
    return category === 'unknown' ? 'general' : category;
  }

  private schedulePrefetchAnalysis(key: string, toolName?: string): void {
    // Add to prefetch consideration queue
    this.prefetchQueue.add(key);
    
    // Limit prefetch queue size
    if (this.prefetchQueue.size > 100) {
      const keyToRemove = this.prefetchQueue.values().next().value;
      this.prefetchQueue.delete(keyToRemove);
    }
  }

  private async performPrefetchAnalysis(): Promise<void> {
    try {
      const now = Date.now();
      const candidatesForPrefetch: string[] = [];
      
      // Analyze usage patterns for prefetch candidates
      for (const [key, pattern] of this.usagePatterns) {
        if (pattern.score > this.options.prefetchThreshold && 
            pattern.predictedNextAccess > 0 && 
            pattern.predictedNextAccess <= now + (5 * 60 * 1000)) { // Within next 5 minutes
          
          if (!this.cache.has(key)) {
            candidatesForPrefetch.push(key);
          }
        }
      }
      
      if (candidatesForPrefetch.length > 0) {
        logger.debug('IntelligentCache prefetch analysis', { 
          candidates: candidatesForPrefetch.length,
          patterns: this.usagePatterns.size 
        });
        
        // In a real implementation, you would trigger prefetch operations here
        // For now, we just log the analysis
      }
      
      // Clean up old patterns
      this.cleanupOldPatterns();
      
    } catch (error) {
      logger.error('IntelligentCache prefetch analysis error', { error });
    }
  }

  private cleanupOldPatterns(): void {
    const now = Date.now();
    const cutoff = now - this.options.patternRecognitionWindow;
    
    for (const [key, pattern] of this.usagePatterns) {
      if (pattern.lastAccessed < cutoff) {
        this.usagePatterns.delete(key);
      }
    }
  }

  private startPatternAnalysis(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }
    
    this.analysisTimer = setInterval(() => {
      this.performPrefetchAnalysis();
    }, this.options.analysisInterval);
  }

  private stopPatternAnalysis(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
  }

  private handleCacheEviction(key: string, value: any): void {
    if (metrics.isEnabled()) {
      metrics.recordCacheOperation(this.getCacheType(key), 'eviction');
    }
    
    logger.debug('IntelligentCache eviction', { key: this.sanitizeKey(key) });
  }

  private getHitRatio(): number {
    if (this.accessHistory.length === 0) return 1;
    
    const recentAccess = this.accessHistory.slice(-1000); // Last 1000 accesses
    const hits = recentAccess.filter(access => this.cache.has(access.key)).length;
    
    return hits / recentAccess.length;
  }

  private sanitizeKey(key: string): string {
    // Remove sensitive information from keys for logging
    return key.length > 100 ? key.substring(0, 100) + '...' : key;
  }

  public destroy(): void {
    this.stopPatternAnalysis();
    this.clear();
    logger.info('IntelligentCache destroyed');
  }

  // Tool-specific cache methods with intelligent defaults
  public async getSearchResult(query: string, index?: string): Promise<any> {
    const key = `search:${index || '*'}:${this.hashQuery(query)}`;
    return this.get(key, 'search');
  }

  public setSearchResult(query: string, result: any, index?: string): void {
    const key = `search:${index || '*'}:${this.hashQuery(query)}`;
    this.set(key, result, undefined, 'search');
  }

  public async getMappings(index: string): Promise<any> {
    const key = `mappings:${index}`;
    return this.get(key, 'get_mappings');
  }

  public setMappings(index: string, mappings: any): void {
    const key = `mappings:${index}`;
    this.set(key, mappings, undefined, 'get_mappings');
  }

  public async getIndicesList(): Promise<any> {
    const key = 'indices:list';
    return this.get(key, 'list_indices');
  }

  public setIndicesList(indices: any): void {
    const key = 'indices:list';
    this.set(key, indices, undefined, 'list_indices');
  }

  private hashQuery(query: string): string {
    // Simple hash function for query strings
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}