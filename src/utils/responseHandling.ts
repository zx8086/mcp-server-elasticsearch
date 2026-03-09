/* src/utils/responseHandling.ts */

import { logger } from "./logger.js";

export interface PaginationOptions {
  limit?: number;
  maxLimit?: number;
  defaultLimit?: number;
  offset?: number;
}

export interface ResponseSizeOptions {
  maxTokens?: number;
  summarize?: boolean;
  truncateFields?: string[];
  excludeFields?: string[];
}

export interface ResponseMetadata {
  total: number;
  returned: number;
  truncated: boolean;
  summary?: string;
}

export function paginateResults<T>(
  items: T[],
  options: PaginationOptions = {},
): { results: T[]; metadata: ResponseMetadata } {
  const { limit, maxLimit = 100, offset = 0, defaultLimit = 20 } = options;

  // Use provided limit, fall back to defaultLimit if not provided
  const effectiveLimit = Math.min(limit || defaultLimit, maxLimit);
  const startIndex = Math.max(0, offset);
  const endIndex = startIndex + effectiveLimit;

  const results = items.slice(startIndex, endIndex);
  const metadata: ResponseMetadata = {
    total: items.length,
    returned: results.length,
    truncated: items.length > endIndex,
  };

  if (metadata.truncated) {
    metadata.summary = `Showing ${results.length} of ${items.length} results. Use pagination parameters to see more.`;
  }

  return { results, metadata };
}

export function estimateTokenCount(text: string): number {
  // Rough approximation: ~4 characters per token for JSON content
  return Math.ceil(text.length / 4);
}

export function truncateResponse(
  content: string,
  options: ResponseSizeOptions = {},
): { content: string; truncated: boolean; originalTokens: number; finalTokens: number } {
  const { maxTokens = 20000 } = options;

  const originalTokens = estimateTokenCount(content);

  if (originalTokens <= maxTokens) {
    return {
      content,
      truncated: false,
      originalTokens,
      finalTokens: originalTokens,
    };
  }

  // Calculate how much to keep (leaving room for truncation message)
  const truncationMessage = "\n\n... [Response truncated due to size limits] ...";
  const maxChars = (maxTokens - estimateTokenCount(truncationMessage)) * 4;

  const truncatedContent = content.substring(0, maxChars) + truncationMessage;
  const finalTokens = estimateTokenCount(truncatedContent);

  logger.warn("Response truncated due to size limits", {
    originalTokens,
    finalTokens,
    maxTokens,
  });

  return {
    content: truncatedContent,
    truncated: true,
    originalTokens,
    finalTokens,
  };
}

export function reduceObjectSize(obj: any, options: ResponseSizeOptions = {}): any {
  const { truncateFields = [], excludeFields = [] } = options;

  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => reduceObjectSize(item, options));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip excluded fields
    if (excludeFields.includes(key)) {
      continue;
    }

    // Truncate specified fields if they're arrays
    if (truncateFields.includes(key) && Array.isArray(value)) {
      const maxItems = 5; // Reduce from 10 to 5 for better size control
      result[key] =
        value.length > maxItems ? [...value.slice(0, maxItems), `... and ${value.length - maxItems} more`] : value;
      continue;
    }

    // Recursively process nested objects
    result[key] = reduceObjectSize(value, options);
  }

  return result;
}

export function createPaginationHeader(metadata: ResponseMetadata, entityName = "items"): string {
  const lines = [
    `## ${entityName.charAt(0).toUpperCase() + entityName.slice(1)} (${metadata.returned}${metadata.truncated ? ` of ${metadata.total}` : ""})`,
  ];

  if (metadata.truncated) {
    lines.push(`⚠️ ${metadata.summary}`);
  }

  return `${lines.join("\n")}\n`;
}

export function formatAsMarkdown(obj: any, title?: string): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`### ${title}`);
  }

  if (typeof obj === "object" && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        lines.push(`- **${key}**: ${value.length} items`);
        if (value.length <= 5) {
          for (const item of value) {
            lines.push(`  - ${item}`);
          }
        } else {
          for (const item of value.slice(0, 3)) {
            lines.push(`  - ${item}`);
          }
          lines.push(`  - ... and ${value.length - 3} more`);
        }
      } else if (typeof value === "object" && value !== null) {
        lines.push(`- **${key}**: [Object]`);
      } else {
        lines.push(`- **${key}**: ${value}`);
      }
    }
  } else {
    lines.push(String(obj));
  }

  return lines.join("\n");
}

export const sortFunctions = {
  byName: (a: any, b: any) => (a.name || "").localeCompare(b.name || ""),
  byDate: (a: any, b: any) =>
    new Date(b.date || b.modified_date || 0).getTime() - new Date(a.date || a.modified_date || 0).getTime(),
  bySize: (a: any, b: any) => (b.size || 0) - (a.size || 0),
  byCount: (a: any, b: any) => (b.count || 0) - (a.count || 0),
};

export const responsePresets = {
  list: {
    defaultLimit: 20,
    maxLimit: 100,
    maxTokens: 15000,
  },
  detail: {
    defaultLimit: 5,
    maxLimit: 20,
    maxTokens: 20000,
  },
  summary: {
    defaultLimit: 50,
    maxLimit: 200,
    maxTokens: 10000,
  },
} as const;
