/* src/utils/mcpAnnotations.ts */

/**
 * MCP Content Annotations Utility
 * 
 * Provides optional metadata annotations for MCP content items to enhance
 * client-side logging and eliminate "metadata: undefined" in client logs.
 * 
 * Based on MCP specification support for _meta fields on content items.
 */

export interface MCPContentMetadata {
  // Timing information
  executionTimeMs?: number;
  elasticsearchTimeMs?: number;
  
  // Result information
  totalResults?: number;
  returnedResults?: number;
  fromOffset?: number;
  
  // Performance indicators
  performance?: "excellent" | "good" | "acceptable" | "slow";
  
  // Query information
  queryType?: string;
  index?: string;
  hasAggregations?: boolean;
  
  // Operation context
  operation?: string;
  operationId?: string;
  
  // Timestamps
  timestamp?: string;
  lastModified?: string;
  
  // Priority and audience (following MCP patterns)
  priority?: number;
  audience?: string[];
}

export interface EnhancedTextContent {
  type: "text";
  text: string;
  _meta?: MCPContentMetadata;
}

export interface EnhancedImageContent {
  type: "image";
  data: string;
  mimeType: string;
  _meta?: MCPContentMetadata;
}

export interface EnhancedResourceContent {
  type: "resource";
  resource: {
    text?: string;
    uri: string;
    mimeType?: string;
    blob?: string;
  };
  _meta?: MCPContentMetadata;
}

export type EnhancedContentItem = EnhancedTextContent | EnhancedImageContent | EnhancedResourceContent;

/**
 * Create enhanced text content with optional metadata
 */
export function createTextContent(text: string, metadata?: MCPContentMetadata): EnhancedTextContent {
  const content: EnhancedTextContent = {
    type: "text",
    text,
  };
  
  if (metadata) {
    content._meta = {
      ...metadata,
      timestamp: metadata.timestamp || new Date().toISOString(),
    };
  }
  
  return content;
}

/**
 * Create enhanced image content with optional metadata
 */
export function createImageContent(
  data: string, 
  mimeType: string, 
  metadata?: MCPContentMetadata
): EnhancedImageContent {
  const content: EnhancedImageContent = {
    type: "image",
    data,
    mimeType,
  };
  
  if (metadata) {
    content._meta = {
      ...metadata,
      timestamp: metadata.timestamp || new Date().toISOString(),
    };
  }
  
  return content;
}

/**
 * Create enhanced resource content with optional metadata
 */
export function createResourceContent(
  resource: { text?: string; uri: string; mimeType?: string; blob?: string },
  metadata?: MCPContentMetadata
): EnhancedResourceContent {
  const content: EnhancedResourceContent = {
    type: "resource",
    resource,
  };
  
  if (metadata) {
    content._meta = {
      ...metadata,
      timestamp: metadata.timestamp || new Date().toISOString(),
    };
  }
  
  return content;
}

/**
 * Create metadata for search operations
 */
export function createSearchMetadata({
  totalResults,
  returnedResults,
  executionTimeMs,
  elasticsearchTimeMs,
  queryType,
  index,
  hasAggregations = false,
  fromOffset = 0,
}: {
  totalResults?: number;
  returnedResults?: number;
  executionTimeMs?: number;
  elasticsearchTimeMs?: number;
  queryType?: string;
  index?: string;
  hasAggregations?: boolean;
  fromOffset?: number;
}): MCPContentMetadata {
  const performance = executionTimeMs 
    ? executionTimeMs < 1000 ? "excellent" 
      : executionTimeMs < 5000 ? "good" 
      : executionTimeMs < 15000 ? "acceptable" 
      : "slow"
    : undefined;

  return {
    totalResults,
    returnedResults,
    executionTimeMs,
    elasticsearchTimeMs,
    queryType,
    index,
    hasAggregations,
    fromOffset,
    performance,
    operation: "search",
    timestamp: new Date().toISOString(),
    audience: ["user"],
    priority: performance === "slow" ? 0.9 : 0.5, // High priority for slow operations
  };
}

/**
 * Create metadata for index operations
 */
export function createIndexMetadata({
  operationId,
  executionTimeMs,
  index,
  operation,
}: {
  operationId?: string;
  executionTimeMs?: number;
  index?: string;
  operation: string;
}): MCPContentMetadata {
  const performance = executionTimeMs 
    ? executionTimeMs < 500 ? "excellent" 
      : executionTimeMs < 2000 ? "good" 
      : executionTimeMs < 10000 ? "acceptable" 
      : "slow"
    : undefined;

  return {
    operationId,
    executionTimeMs,
    index,
    operation,
    performance,
    timestamp: new Date().toISOString(),
    audience: ["user"],
    priority: 0.5,
  };
}

/**
 * Create metadata for cluster operations
 */
export function createClusterMetadata({
  executionTimeMs,
  operation,
}: {
  executionTimeMs?: number;
  operation: string;
}): MCPContentMetadata {
  return {
    executionTimeMs,
    operation,
    performance: executionTimeMs && executionTimeMs < 1000 ? "excellent" : "good",
    timestamp: new Date().toISOString(),
    audience: ["user"],
    priority: 0.3, // Lower priority for cluster info
  };
}

/**
 * Helper to add metadata to existing content items
 */
export function enhanceContent<T extends { type: string; [key: string]: any }>(
  content: T,
  metadata: MCPContentMetadata
): T & { _meta: MCPContentMetadata } {
  return {
    ...content,
    _meta: {
      ...metadata,
      timestamp: metadata.timestamp || new Date().toISOString(),
    },
  };
}