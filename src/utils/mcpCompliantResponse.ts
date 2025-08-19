/* src/utils/mcpCompliantResponse.ts */

import type { SearchResult, TextContent } from "../tools/types.js";
import { logger } from "./logger.js";

/**
 * MCP Specification Compliant Response Builder
 *
 * According to MCP specification:
 * 1. Tools should return both human-readable text AND structured content
 * 2. Structured content should be serialized as JSON
 * 3. Error responses should use isError: true
 * 4. Content should support multiple types (text, image, resource, etc.)
 * 5. Annotations can provide metadata about content
 */

export interface MCPToolResponse {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: any;
    annotations?: {
      audience?: string[];
      priority?: number;
      [key: string]: any;
    };
  }>;
  isError?: boolean;
  _meta?: {
    [key: string]: any;
  };
}

/**
 * Create an MCP-compliant success response with both text and structured data
 */
export function createSuccessResponse(
  data: any,
  options: {
    toolName?: string;
    summary?: string;
    includeStructured?: boolean;
    annotations?: Record<string, any>;
  } = {},
): SearchResult {
  const { toolName, summary, includeStructured = true, annotations } = options;

  // Build content array
  const content: any[] = [];

  // Add human-readable summary if provided
  if (summary) {
    content.push({
      type: "text",
      text: summary,
      annotations: {
        audience: ["human"],
        priority: 1,
        ...(annotations || {}),
      },
    });
  }

  // Add the main data as formatted JSON text
  content.push({
    type: "text",
    text: JSON.stringify(data, null, 2),
    annotations: {
      audience: ["model", "human"],
      format: "json",
      priority: 2,
      ...(annotations || {}),
    },
  });

  // Build the response
  const response: SearchResult = {
    content,
  };

  // Add structured content for model consumption (best practice)
  if (includeStructured && data) {
    response.structuredContent = data;
  }

  // Add metadata if available
  if (toolName) {
    response._meta = {
      tool: toolName,
      timestamp: new Date().toISOString(),
    };
  }

  return response;
}

/**
 * Create an MCP-compliant error response
 */
export function createErrorResponse(
  error: Error | string,
  options: {
    toolName?: string;
    code?: string;
    details?: any;
    suggestions?: string[];
  } = {},
): SearchResult {
  const { toolName, code, details, suggestions } = options;

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Build content array
  const content: any[] = [];

  // Add the error message
  content.push({
    type: "text",
    text: `Error: ${errorMessage}`,
    annotations: {
      audience: ["human", "model"],
      severity: "error",
      priority: 1,
    },
  });

  // Add suggestions if provided
  if (suggestions && suggestions.length > 0) {
    content.push({
      type: "text",
      text: `Suggestions:\n${suggestions.map((s) => `• ${s}`).join("\n")}`,
      annotations: {
        audience: ["human"],
        severity: "info",
        priority: 2,
      },
    });
  }

  // Add details if provided
  if (details) {
    content.push({
      type: "text",
      text: JSON.stringify(details, null, 2),
      annotations: {
        audience: ["model"],
        format: "json",
        severity: "debug",
        priority: 3,
      },
    });
  }

  // Build the error response
  const response: SearchResult = {
    content,
    isError: true, // MCP spec: mark errors explicitly
  };

  // Add structured error information
  response.structuredContent = {
    error: {
      message: errorMessage,
      code: code || "UNKNOWN_ERROR",
      details,
      stack: errorStack,
    },
  };

  // Add metadata
  response._meta = {
    tool: toolName,
    timestamp: new Date().toISOString(),
    errorCode: code,
  };

  logger.error(`Tool error in ${toolName}:`, {
    error: errorMessage,
    code,
    details,
  });

  return response;
}

/**
 * Create a response for large datasets with pagination info
 */
export function createPaginatedResponse(
  data: any,
  pagination: {
    total: number;
    returned: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    nextToken?: string;
  },
  options: {
    toolName?: string;
    summary?: string;
  } = {},
): SearchResult {
  const { toolName, summary } = options;

  // Build content array
  const content: any[] = [];

  // Add pagination summary
  const paginationSummary = `Showing ${pagination.returned} of ${pagination.total} results (offset: ${pagination.offset}, limit: ${pagination.limit})`;

  content.push({
    type: "text",
    text: summary || paginationSummary,
    annotations: {
      audience: ["human"],
      priority: 1,
    },
  });

  // Add pagination metadata
  content.push({
    type: "text",
    text: JSON.stringify(pagination, null, 2),
    annotations: {
      audience: ["model"],
      format: "pagination",
      priority: 2,
    },
  });

  // Add the data
  content.push({
    type: "text",
    text: JSON.stringify(data, null, 2),
    annotations: {
      audience: ["model", "human"],
      format: "json",
      priority: 3,
    },
  });

  // Build response with structured content
  const response: SearchResult = {
    content,
    structuredContent: {
      data,
      pagination,
    },
    _meta: {
      tool: toolName,
      timestamp: new Date().toISOString(),
      pagination,
    },
  };

  return response;
}

/**
 * Create a response with resource links (for documents, images, etc.)
 */
export function createResourceResponse(
  resources: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    description?: string;
  }>,
  options: {
    toolName?: string;
    summary?: string;
  } = {},
): SearchResult {
  const { toolName, summary } = options;

  // Build content array
  const content: any[] = [];

  // Add summary
  if (summary) {
    content.push({
      type: "text",
      text: summary,
      annotations: {
        audience: ["human"],
        priority: 1,
      },
    });
  }

  // Add resources
  for (const resource of resources) {
    if (resource.blob) {
      // Binary resource
      content.push({
        type: "resource",
        resource: {
          uri: resource.uri,
          blob: resource.blob,
          mimeType: resource.mimeType,
        },
        annotations: {
          description: resource.description,
        },
      });
    } else if (resource.text) {
      // Text resource
      content.push({
        type: "resource",
        resource: {
          text: resource.text,
          uri: resource.uri,
          mimeType: resource.mimeType || "text/plain",
        },
        annotations: {
          description: resource.description,
        },
      });
    }
  }

  return {
    content,
    _meta: {
      tool: toolName,
      timestamp: new Date().toISOString(),
      resourceCount: resources.length,
    },
  };
}

/**
 * Transform legacy response format to MCP-compliant format
 */
export function transformToMCPResponse(legacyResponse: any, toolName?: string): SearchResult {
  // If already MCP-compliant, return as-is
  if (legacyResponse?.content && Array.isArray(legacyResponse.content)) {
    return legacyResponse;
  }

  // Handle error responses
  if (legacyResponse?.error || legacyResponse?.isError) {
    return createErrorResponse(legacyResponse.error || legacyResponse.message || "Unknown error", {
      toolName,
      details: legacyResponse,
    });
  }

  // Handle simple text responses
  if (typeof legacyResponse === "string") {
    return {
      content: [
        {
          type: "text",
          text: legacyResponse,
        },
      ],
    };
  }

  // Handle object responses
  return createSuccessResponse(legacyResponse, {
    toolName,
    includeStructured: true,
  });
}
