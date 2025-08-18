/* src/utils/responseSizing.ts */

import type { Client } from "@elastic/elasticsearch";
import { logger } from "./logger.js";

// Maximum response size before truncation (2MB)
const MAX_RESPONSE_SIZE = 2097152;

// Average sizes for different data types (in bytes)
const AVERAGE_SIZES = {
  shard: 200,      // Per shard info
  index: 500,      // Per index metadata
  document: 1000,  // Per document with source
  node: 5000,      // Per node full info
  node_compact: 1000, // Per node compact info
  ilm_index: 300,  // Per ILM index info
  ilm_index_full: 1500, // Per ILM index with full details
};

/**
 * Estimate the response size for a given operation
 */
export async function estimateResponseSize(
  client: Client,
  operation: string,
  params: any
): Promise<{
  estimatedSize: number;
  recommendedLimit: number;
  warning?: string;
}> {
  try {
    switch (operation) {
      case 'shards': {
        // Count shards first
        const shards = await client.cat.shards({
          format: 'json',
          h: 'index', // Minimal fields for counting
          ...(params.index && { index: params.index }),
        });
        const count = shards.length;
        const estimatedSize = count * AVERAGE_SIZES.shard;
        
        if (estimatedSize > MAX_RESPONSE_SIZE) {
          const recommendedLimit = Math.floor(MAX_RESPONSE_SIZE / AVERAGE_SIZES.shard);
          return {
            estimatedSize,
            recommendedLimit,
            warning: `Response would be ~${Math.round(estimatedSize / 1024)}KB. Recommend limiting to ${recommendedLimit} shards.`,
          };
        }
        
        return { estimatedSize, recommendedLimit: count };
      }
      
      case 'nodes_info': {
        // Count nodes
        const nodes = await client.nodes.info({ metric: 'name' });
        const nodeCount = Object.keys(nodes.nodes).length;
        const isCompact = params.compact !== false;
        const sizePerNode = isCompact ? AVERAGE_SIZES.node_compact : AVERAGE_SIZES.node;
        const estimatedSize = nodeCount * sizePerNode;
        
        if (estimatedSize > MAX_RESPONSE_SIZE && !isCompact) {
          return {
            estimatedSize,
            recommendedLimit: nodeCount,
            warning: `Full node info would be ~${Math.round(estimatedSize / 1024)}KB. Using compact mode automatically.`,
          };
        }
        
        return { estimatedSize, recommendedLimit: nodeCount };
      }
      
      case 'ilm_explain': {
        // Count indices with ILM
        const catIndices = await client.cat.indices({
          format: 'json',
          h: 'index',
          ...(params.index && { index: params.index }),
        });
        const indexCount = catIndices.length;
        const includeDetails = params.includeDetails ?? false;
        const sizePerIndex = includeDetails ? AVERAGE_SIZES.ilm_index_full : AVERAGE_SIZES.ilm_index;
        const estimatedSize = indexCount * sizePerIndex;
        
        if (estimatedSize > MAX_RESPONSE_SIZE) {
          const recommendedLimit = Math.floor(MAX_RESPONSE_SIZE / sizePerIndex);
          return {
            estimatedSize,
            recommendedLimit: Math.min(recommendedLimit, 100), // Cap at 100
            warning: `Response would be ~${Math.round(estimatedSize / 1024)}KB. Recommend limiting to ${recommendedLimit} indices.`,
          };
        }
        
        return { estimatedSize, recommendedLimit: indexCount };
      }
      
      case 'search': {
        // Estimate based on requested size
        const size = params.queryBody?.size ?? 10;
        const estimatedSize = size * AVERAGE_SIZES.document;
        
        if (estimatedSize > MAX_RESPONSE_SIZE) {
          const recommendedLimit = Math.floor(MAX_RESPONSE_SIZE / AVERAGE_SIZES.document);
          return {
            estimatedSize,
            recommendedLimit,
            warning: `Response would be ~${Math.round(estimatedSize / 1024)}KB. Recommend limiting to ${recommendedLimit} documents.`,
          };
        }
        
        return { estimatedSize, recommendedLimit: size };
      }
      
      case 'indices': {
        // Count indices
        const catIndices = await client.cat.indices({
          format: 'json',
          h: 'index',
          ...(params.indexPattern && { index: params.indexPattern }),
        });
        const count = catIndices.length;
        const estimatedSize = count * AVERAGE_SIZES.index;
        
        if (estimatedSize > MAX_RESPONSE_SIZE) {
          const recommendedLimit = Math.floor(MAX_RESPONSE_SIZE / AVERAGE_SIZES.index);
          return {
            estimatedSize,
            recommendedLimit,
            warning: `Response would be ~${Math.round(estimatedSize / 1024)}KB. Recommend limiting to ${recommendedLimit} indices.`,
          };
        }
        
        return { estimatedSize, recommendedLimit: count };
      }
      
      default:
        return { estimatedSize: 0, recommendedLimit: 100 };
    }
  } catch (error) {
    logger.warn(`Failed to estimate response size for ${operation}:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    
    // Return safe defaults on error
    return { estimatedSize: 0, recommendedLimit: 100 };
  }
}

/**
 * Add size-aware defaults to tool parameters
 */
export function addSizeAwareDefaults(toolName: string, params: any): any {
  const sizeDefaults: Record<string, any> = {
    'elasticsearch_get_shards': {
      limit: 100,
      sortBy: 'state', // Unhealthy first
    },
    'elasticsearch_get_nodes_info': {
      compact: true, // Default to compact
    },
    'elasticsearch_ilm_explain_lifecycle': {
      onlyManaged: true, // Reduce results
      limit: 50,
      includeDetails: false, // Compact by default
    },
    'elasticsearch_search': {
      // Don't override size if explicitly set to 0 (aggregations only)
      ...(params.queryBody?.size === undefined && { 
        queryBody: { ...params.queryBody, size: 10 } 
      }),
    },
    'elasticsearch_list_indices': {
      limit: 50,
      excludeSystemIndices: true,
    },
    'elasticsearch_get_aliases': {
      limit: 20,
    },
    'elasticsearch_get_index_template': {
      limit: 20,
    },
  };
  
  const defaults = sizeDefaults[toolName] || {};
  
  // Merge defaults with provided params (params take precedence)
  return {
    ...defaults,
    ...params,
    // For nested objects like queryBody, merge deeply
    ...(defaults.queryBody && params.queryBody && {
      queryBody: { ...defaults.queryBody, ...params.queryBody }
    }),
  };
}

/**
 * Get a helpful message about response size
 */
export function getSizeWarningMessage(
  actualSize: number,
  limit: number,
  total: number,
  entityType: string
): string {
  const sizeKB = Math.round(actualSize / 1024);
  const percentage = Math.round((limit / total) * 100);
  
  if (actualSize > MAX_RESPONSE_SIZE * 0.8) {
    return `⚠️ Large response (${sizeKB}KB). Showing ${limit} of ${total} ${entityType} (${percentage}%). Consider using filters or smaller limits.`;
  } else if (limit < total) {
    return `📊 Showing ${limit} of ${total} ${entityType} (${percentage}%). Use 'limit' parameter to see more.`;
  } else {
    return `✅ Showing all ${total} ${entityType}.`;
  }
}

/**
 * Check if pre-sizing is recommended for a tool
 */
export function shouldPreSize(toolName: string): boolean {
  const preSizeTools = [
    'elasticsearch_get_shards',
    'elasticsearch_get_nodes_info',
    'elasticsearch_ilm_explain_lifecycle',
    'elasticsearch_list_indices',
    'elasticsearch_get_aliases',
    'elasticsearch_get_index_template',
  ];
  
  return preSizeTools.includes(toolName);
}