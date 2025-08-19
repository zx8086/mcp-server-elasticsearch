/* src/utils/responseHandler.ts */

import { logger } from "./logger.js";

const MAX_RESPONSE_SIZE = 2097152; // 2MB limit for better usability
const TRUNCATION_BUFFER = 1000; // Leave room for truncation message
const SMART_TRUNCATION_ENABLED = true; // Enable intelligent truncation

/**
 * Handle large responses by truncating or summarizing them
 */
export function handleLargeResponse(
  toolName: string,
  response: any,
  options: {
    maxSize?: number;
    summarize?: boolean;
  } = {},
): any {
  const maxSize = options.maxSize || MAX_RESPONSE_SIZE;

  // Convert response to string to check size
  let responseStr: string;

  try {
    responseStr = typeof response === "string" ? response : JSON.stringify(response, null, 2);
  } catch (error) {
    logger.error(`Failed to stringify response for tool ${toolName}:`, error);
    return {
      content: [
        {
          type: "text",
          text: "Error: Response could not be serialized. The response may contain circular references or other non-serializable data.",
        },
      ],
    };
  }

  // Check if response is within limits
  if (responseStr.length <= maxSize) {
    return response;
  }

  logger.info(`Response from ${toolName} exceeds maximum size, applying smart truncation`, {
    actualSize: responseStr.length,
    maxSize,
    toolName,
    smartTruncation: SMART_TRUNCATION_ENABLED,
  });

  // Try to intelligently truncate based on response type
  if (typeof response === "object" && response !== null) {
    return truncateObject(toolName, response, maxSize);
  } else {
    // For strings, simple truncation
    const truncated = responseStr.substring(0, maxSize - TRUNCATION_BUFFER);
    return {
      content: [
        {
          type: "text",
          text: `${truncated}\n\n⚠️ Response truncated. Original size: ${responseStr.length} bytes, limit: ${maxSize} bytes.`,
        },
      ],
    };
  }
}

/**
 * Intelligently truncate an object response
 */
function truncateObject(toolName: string, obj: any, maxSize: number): any {
  // Handle array responses (common for list operations)
  if (Array.isArray(obj)) {
    return truncateArray(toolName, obj, maxSize);
  }

  // Handle search results with hits
  if (obj.hits && obj.hits.hits && Array.isArray(obj.hits.hits)) {
    return truncateSearchResults(toolName, obj, maxSize);
  }

  // Handle responses with content array (MCP format)
  if (obj.content && Array.isArray(obj.content)) {
    return truncateContentArray(toolName, obj, maxSize);
  }

  // Handle indices responses
  if (obj.indices && typeof obj.indices === "object") {
    return truncateIndicesResponse(toolName, obj, maxSize);
  }

  // Generic object truncation
  return genericObjectTruncation(toolName, obj, maxSize);
}

/**
 * Truncate array responses
 */
function truncateArray(toolName: string, arr: any[], maxSize: number): any {
  const itemCount = arr.length;
  let includedItems = 0;
  let result: any[] = [];
  let currentSize = 100; // Start with some overhead for structure

  for (const item of arr) {
    const itemStr = JSON.stringify(item);
    if (currentSize + itemStr.length > maxSize - TRUNCATION_BUFFER) {
      break;
    }
    result.push(item);
    currentSize += itemStr.length;
    includedItems++;
  }

  const summary = {
    total_items: itemCount,
    included_items: includedItems,
    truncated: includedItems < itemCount,
    message: `Showing ${includedItems} of ${itemCount} items due to size limits.`,
  };

  return {
    content: [
      { type: "text", text: JSON.stringify(summary, null, 2) },
      { type: "text", text: JSON.stringify(result, null, 2) },
    ],
  };
}

/**
 * Truncate Elasticsearch search results
 */
function truncateSearchResults(toolName: string, obj: any, maxSize: number): any {
  const totalHits = obj.hits?.total?.value || obj.hits?.total || obj.hits?.hits?.length || 0;
  const hits = obj.hits?.hits || [];

  // Try to include more hits by being smarter about space
  let includedHits = 0;
  let truncatedHits: any[] = [];
  let currentSize = 500; // Account for metadata
  const targetHits = Math.min(hits.length, 100); // Try to include up to 100 hits

  for (let i = 0; i < targetHits && i < hits.length; i++) {
    const hit = hits[i];

    // Create a compact version first
    const compactHit = {
      _index: hit._index,
      _id: hit._id,
      _score: hit._score,
      _source: truncateSource(hit._source, i < 20 ? 2000 : 500), // More detail for first 20 hits
      ...(hit.highlight ? { highlight: hit.highlight } : {}),
    };

    const hitStr = JSON.stringify(compactHit);
    if (currentSize + hitStr.length > maxSize - TRUNCATION_BUFFER) {
      // If we've included at least some hits, stop here
      if (includedHits >= 10) break;
      // Otherwise, try with even more compact format
      compactHit._source = truncateSource(hit._source, 200);
    }

    truncatedHits.push(compactHit);
    currentSize += hitStr.length;
    includedHits++;
  }

  const result = {
    took: obj.took,
    timed_out: obj.timed_out,
    _shards: obj._shards,
    hits: {
      total: obj.hits?.total || { value: totalHits },
      max_score: obj.hits?.max_score,
      hits: truncatedHits,
    },
    _truncated: {
      original_hit_count: totalHits,
      included_hit_count: includedHits,
      message: `Response truncated. Showing ${includedHits} of ${totalHits} hits.`,
    },
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Truncate source document to a maximum size
 */
function truncateSource(source: any, maxSourceSize: number): any {
  if (!source) return source;

  const sourceStr = JSON.stringify(source);
  if (sourceStr.length <= maxSourceSize) {
    return source;
  }

  // For large sources, just include key fields
  const truncated: any = {};
  // Expand important fields list for better context
  const importantFields = [
    "@timestamp",
    "timestamp",
    "date",
    "time",
    "message",
    "msg",
    "text",
    "content",
    "body",
    "level",
    "severity",
    "priority",
    "error",
    "exception",
    "error_message",
    "error_code",
    "status",
    "status_code",
    "response_code",
    "http_status",
    "name",
    "id",
    "uuid",
    "_id",
    "doc_id",
    "type",
    "category",
    "kind",
    "event_type",
    "user",
    "username",
    "user_id",
    "host",
    "hostname",
    "server",
    "path",
    "url",
    "uri",
    "endpoint",
    "method",
    "action",
    "operation",
    "duration",
    "response_time",
    "took",
    "tags",
    "labels",
    "metadata",
  ];

  for (const field of importantFields) {
    if (field in source) {
      truncated[field] = source[field];
    }
  }

  truncated._truncated = true;
  return truncated;
}

/**
 * Truncate content array responses
 */
function truncateContentArray(toolName: string, obj: any, maxSize: number): any {
  const content = obj.content || [];
  let truncatedContent: any[] = [];
  let currentSize = 100;
  let actualItemsIncluded = 0;

  for (const item of content) {
    const itemStr = typeof item === "object" ? JSON.stringify(item) : String(item);

    if (currentSize + itemStr.length > maxSize - TRUNCATION_BUFFER) {
      // Add truncation notice with helpful suggestions
      const suggestions = toolName.includes("ilm")
        ? "Add parameters to control response: {limit: 50, onlyManaged: true}"
        : toolName.includes("shards")
          ? "Add parameters to control response: {limit: 100, sortBy: 'state'}"
          : toolName.includes("nodes")
            ? "Add parameters to control response: {compact: true} or {metric: 'os,jvm'}"
            : "Consider using filters, specific patterns, or size limits.";

      truncatedContent.push({
        type: "text",
        text: `⚠️ Response truncated. Showing ${actualItemsIncluded} of ${content.length} content items.\n${suggestions}`,
      });
      break;
    }

    truncatedContent.push(item);
    currentSize += itemStr.length;

    // Count actual data items (not metadata)
    if (item.type === "text" && !item.text?.startsWith("⚠️")) {
      actualItemsIncluded++;
    }
  }

  // If no content could be included, provide a more helpful message
  if (actualItemsIncluded === 0 && content.length > 0) {
    return {
      content: [
        {
          type: "text",
          text: `⚠️ Response too large to display (${content.length} items). The data exists but exceeds size limits.\nSuggestions:\n• Use more specific filters or patterns\n• Add a 'limit' parameter to reduce results\n• Query for specific items instead of wildcards`,
        },
      ],
    };
  }

  return { content: truncatedContent };
}

/**
 * Truncate indices response
 */
function truncateIndicesResponse(toolName: string, obj: any, maxSize: number): any {
  const indices = Object.keys(obj.indices || {});
  const totalIndices = indices.length;

  if (totalIndices === 0) {
    return obj;
  }

  let includedIndices: Record<string, any> = {};
  let currentSize = 200;
  let includedCount = 0;

  for (const indexName of indices) {
    const indexData = obj.indices[indexName];
    const indexStr = JSON.stringify(indexData);

    if (currentSize + indexStr.length > maxSize - TRUNCATION_BUFFER) {
      break;
    }

    includedIndices[indexName] = indexData;
    currentSize += indexStr.length;
    includedCount++;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            summary: {
              total_indices: totalIndices,
              included_indices: includedCount,
              truncated: includedCount < totalIndices,
              message: `Showing ${includedCount} of ${totalIndices} indices due to size limits.`,
            },
          },
          null,
          2,
        ),
      },
      {
        type: "text",
        text: JSON.stringify({ indices: includedIndices }, null, 2),
      },
    ],
  };
}

/**
 * Generic object truncation
 */
function genericObjectTruncation(toolName: string, obj: any, maxSize: number): any {
  const fullStr = JSON.stringify(obj, null, 2);

  // Try to include as much as possible
  const truncatedStr = fullStr.substring(0, maxSize - TRUNCATION_BUFFER);

  // Find the last complete JSON element
  let lastValidJson = truncatedStr;
  for (let i = truncatedStr.length - 1; i >= 0; i--) {
    if (truncatedStr[i] === "}" || truncatedStr[i] === "]") {
      lastValidJson = truncatedStr.substring(0, i + 1);
      break;
    }
  }

  return {
    content: [
      {
        type: "text",
        text: `${lastValidJson}\n\n⚠️ Response truncated. Original size: ${fullStr.length} bytes, limit: ${maxSize} bytes.\nConsider using filters, smaller size limits, or the 'summarize' parameter if available.`,
      },
    ],
  };
}
