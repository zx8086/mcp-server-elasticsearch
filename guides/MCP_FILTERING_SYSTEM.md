# MCP Filtering System Implementation Guide

This document explains the comprehensive filtering system implemented in the Kong Konnect MCP server and how to adapt it for other MCP implementations.

## Overview

The Kong Konnect MCP server implements a **multi-layer filtering system**that provides sophisticated query capabilities for analytics and data retrieval operations. This system is designed to be **composable**, **type-safe**, and **reusable**across different MCP implementations.

## Architecture Layers

### 1. Type Definition Layer

**File**: `src/types.ts`

Define the core filter interface that serves as the foundation for all filtering operations:

```typescript
export interface ApiRequestFilter {
  field: string; // The field to filter on
  operator: string; // The operator (in, not_in, eq, etc.)
  value: any; // The value(s) to filter by
}
```

**Additional supporting types:**

```typescript
export interface TimeRange {
  type: "relative";
  time_range: string;
}

export interface ApiRequestsResponse {
  meta: {
    size: number;
    time_range: {
      start: string;
      end: string;
    };
  };
  results: ApiRequestResult[];
}
```

### 2. Operation Layer

**File**: `src/operations/analytics.ts`

This layer contains the business logic for building and applying filters:

```typescript
export async function queryApiRequests(
  api: KongApi,
  timeRange: string,
  statusCodes?: number[],
  excludeStatusCodes?: number[],
  httpMethods?: string[],
  consumerIds?: string[],
  serviceIds?: string[],
  routeIds?: string[],
  maxResults = 100
) {
  try {
    // Build filters array dynamically
    const filters: ApiRequestFilter[] = [];

    // Status code filtering
    if (statusCodes && statusCodes.length > 0) {
      filters.push({
        field: "status_code",
        operator: "in",
        value: statusCodes
      });
    }

    // Exclusion filtering
    if (excludeStatusCodes && excludeStatusCodes.length > 0) {
      filters.push({
        field: "status_code",
        operator: "not_in",
        value: excludeStatusCodes
      });
    }

    // HTTP method filtering
    if (httpMethods && httpMethods.length > 0) {
      filters.push({
        field: "http_method",
        operator: "in",
        value: httpMethods
      });
    }

    // Consumer filtering
    if (consumerIds && consumerIds.length > 0) {
      filters.push({
        field: "consumer",
        operator: "in",
        value: consumerIds
      });
    }

    // Service filtering
    if (serviceIds && serviceIds.length > 0) {
      filters.push({
        field: "gateway_service",
        operator: "in",
        value: serviceIds
      });
    }

    // Route filtering
    if (routeIds && routeIds.length > 0) {
      filters.push({
        field: "route",
        operator: "in",
        value: routeIds
      });
    }

    const result = await api.queryApiRequests(timeRange, filters, maxResults);

    // Return formatted response with metadata
    return {
      metadata: {
        totalRequests: result.meta.size,
        timeRange: {
          start: result.meta.time_range.start,
          end: result.meta.time_range.end,
        },
        filters: filters
      },
      requests: result.results.map(req => ({
        // ... formatted request data
      }))
    };
  } catch (error) {
    throw error;
  }
}
```

### 3. API Client Layer

**File**: `src/api/kong-api.ts`

This layer handles the actual HTTP requests with filter payloads:

```typescript
async queryApiRequests(
  timeRange: string, 
  filters: ApiRequestFilter[] = [], 
  maxResults = 100
): Promise<ApiRequestsResponse> {
  
  const requestBody = {
    time_range: {
      type: "relative",
      time_range: timeRange // "15M", "1H", "24H"
    },
    filters: filters, // Array of filter objects
    size: maxResults
  };

  return this.kongRequest<ApiRequestsResponse>("/api-requests", "POST", requestBody);
}
```

## Supported Filter Configuration

### Available Filter Fields

```yaml
supported_filter_fields:
  # Request Identification
  - field: "request_id" # Unique request identifier
  - field: "trace_id" # Distributed tracing ID
  
  # HTTP Attributes 
  - field: "status_code" # HTTP status codes (200, 404, 500)
  - field: "status_code_grouped" # Status groups (2XX, 4XX, 5XX)
  - field: "http_method" # HTTP methods (GET, POST, PUT, DELETE)
  - field: "request_uri" # Request URI path
  
  # Kong Entities
  - field: "consumer" # Consumer UUIDs
  - field: "gateway_service" # Service UUIDs
  - field: "route" # Route UUIDs
  - field: "api_product" # API product names
  - field: "api_product_version" # API product versions
  
  # Application Context
  - field: "application" # Application IDs
  - field: "auth_type" # Authentication type
  
  # Network & Infrastructure
  - field: "client_ip" # Client IP addresses
  - field: "data_plane_node" # Data plane node IDs
  - field: "control_plane" # Control plane IDs
  - field: "control_plane_group" # Control plane group IDs
```

### Available Operators

```yaml
supported_operators:
  - operator: "in" # Value exists in array
    example: ["GET", "POST"]
    
  - operator: "not_in" # Value does not exist in array 
    example: [400, 500]
    
  - operator: "eq" # Equals exact value
    example: "GET"
    
  - operator: "ne" # Not equals value
    example: "POST"
    
  - operator: "gt" # Greater than (numeric)
    example: 200
    
  - operator: "lt" # Less than (numeric)
    example: 400
    
  - operator: "contains" # String contains substring
    example: "api/v1"
```

## Real-World Usage Examples

### Example 1: Error Analysis

```typescript
// Find all 4XX and 5XX errors in the last hour
const errorFilters = [
  {
    field: "status_code_grouped",
    operator: "in",
    value: ["4XX", "5XX"]
  }
];

const result = await queryApiRequests(api, "1H", undefined, undefined, undefined, undefined, undefined, undefined, 1000);
```

### Example 2: Consumer-Specific Analysis

```typescript
// Analyze specific consumer's POST requests only
const consumerFilters = [
  {
    field: "consumer",
    operator: "in",
    value: ["consumer-uuid-123"]
  },
  {
    field: "http_method",
    operator: "in",
    value: ["POST"]
  }
];
```

### Example 3: Service Performance Monitoring

```typescript
// Monitor specific service excluding health checks
const serviceFilters = [
  {
    field: "gateway_service",
    operator: "in",
    value: ["payment-service-uuid"]
  },
  {
    field: "request_uri",
    operator: "not_in",
    value: ["/health", "/metrics"]
  }
];
```

### Example 4: Complex Multi-Criteria Filtering

```typescript
// Production traffic analysis: successful API calls from authenticated users
const productionFilters = [
  {
    field: "status_code_grouped",
    operator: "in",
    value: ["2XX"]
  },
  {
    field: "auth_type",
    operator: "ne",
    value: "anonymous"
  },
  {
    field: "api_product",
    operator: "in",
    value: ["payments-api", "orders-api"]
  }
];
```

## Implementation Guide for Other MCP Servers

### Step 1: Define Filter Interface

```typescript
// Define your filter interface
interface MyFilter {
  field: string;
  operator: 'eq' | 'in' | 'not_in' | 'contains' | 'gt' | 'lt';
  value: any;
}

// Define request/response interfaces
interface FilteredQuery {
  filters: MyFilter[];
  timeRange?: string;
  limit?: number;
  offset?: number;
}

interface FilteredResponse<T> {
  metadata: {
    total: number;
    filtered: number;
    appliedFilters: MyFilter[];
  };
  results: T[];
}
```

### Step 2: Create Filter Builder

```typescript
// Filter builder utility
class FilterBuilder {
  private filters: MyFilter[] = [];

  addFilter(field: string, operator: string, value: any): FilterBuilder {
    this.filters.push({ field, operator, value });
    return this;
  }

  addEqualsFilter(field: string, value: any): FilterBuilder {
    return this.addFilter(field, 'eq', value);
  }

  addInFilter(field: string, values: any[]): FilterBuilder {
    return this.addFilter(field, 'in', values);
  }

  addNotInFilter(field: string, values: any[]): FilterBuilder {
    return this.addFilter(field, 'not_in', values);
  }

  addContainsFilter(field: string, substring: string): FilterBuilder {
    return this.addFilter(field, 'contains', substring);
  }

  build(): MyFilter[] {
    return [...this.filters];
  }

  clear(): FilterBuilder {
    this.filters = [];
    return this;
  }
}
```

### Step 3: Implement Operation Layer

```typescript
// Operation with filter support
export async function searchEntities(
  api: MyApiClient,
  entityType: string,
  tags?: string[],
  statuses?: string[],
  createdAfter?: string,
  limit = 100
): Promise<FilteredResponse<Entity>> {
  
  // Build filters dynamically
  const filterBuilder = new FilterBuilder();

  if (tags && tags.length > 0) {
    filterBuilder.addInFilter('tags', tags);
  }

  if (statuses && statuses.length > 0) {
    filterBuilder.addInFilter('status', statuses);
  }

  if (createdAfter) {
    filterBuilder.addFilter('created_at', 'gt', createdAfter);
  }

  const filters = filterBuilder.build();
  
  const result = await api.queryWithFilters(entityType, filters, limit);

  return {
    metadata: {
      total: result.total,
      filtered: result.results.length,
      appliedFilters: filters
    },
    results: result.results
  };
}
```

### Step 4: Implement API Client Layer

```typescript
// API client with filter support
class MyApiClient {
  async queryWithFilters<T>(
    endpoint: string, 
    filters: MyFilter[], 
    limit = 100
  ): Promise<FilteredResponse<T>> {
    
    const requestBody = {
      filters: filters,
      limit: limit,
      // Add other query parameters as needed
    };

    return this.makeRequest<FilteredResponse<T>>(
      `/search/${endpoint}`, 
      "POST", 
      requestBody
    );
  }

  private async makeRequest<T>(
    endpoint: string, 
    method: string, 
    body?: any
  ): Promise<T> {
    // Implement your HTTP request logic
    const response = await fetch(this.baseUrl + endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
  }
}
```

### Step 5: MCP Tool Integration

```typescript
// MCP tool handler with filters
export async function handleSearchTool(args: any): Promise<any> {
  try {
    const {
      entityType,
      tags,
      statuses,
      createdAfter,
      limit = 100
    } = args;

    const result = await searchEntities(
      api,
      entityType,
      tags,
      statuses,
      createdAfter,
      limit
    );

    return {
      success: true,
      data: result,
      message: `Found ${result.results.length} entities matching criteria`
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      troubleshooting: [
        "Check that entity type is supported",
        "Verify filter values are in correct format",
        "Ensure API credentials have search permissions"
      ]
    };
  }
}
```

## Advanced Filtering Patterns

### 1. Conditional Filter Application

```typescript
// Apply filters only when conditions are met
function buildConditionalFilters(params: QueryParams): MyFilter[] {
  const filters: MyFilter[] = [];

  // Always apply active status filter
  filters.push({
    field: 'status',
    operator: 'eq',
    value: 'active'
  });

  // Apply tag filter only if tags provided
  if (params.tags?.length) {
    filters.push({
      field: 'tags',
      operator: 'in',
      value: params.tags
    });
  }

  // Apply date filter only for recent queries
  if (params.includeRecent) {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    filters.push({
      field: 'created_at',
      operator: 'gt',
      value: oneWeekAgo
    });
  }

  return filters;
}
```

### 2. Filter Validation

```typescript
// Validate filters before applying
function validateFilters(filters: MyFilter[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const supportedFields = ['status', 'tags', 'created_at', 'name'];
  const supportedOperators = ['eq', 'in', 'not_in', 'contains', 'gt', 'lt'];

  for (const filter of filters) {
    if (!supportedFields.includes(filter.field)) {
      errors.push(`Unsupported field: ${filter.field}`);
    }

    if (!supportedOperators.includes(filter.operator)) {
      errors.push(`Unsupported operator: ${filter.operator}`);
    }

    if (filter.value === undefined || filter.value === null) {
      errors.push(`Filter value cannot be null or undefined for field: ${filter.field}`);
    }

    // Validate array operators
    if (['in', 'not_in'].includes(filter.operator) && !Array.isArray(filter.value)) {
      errors.push(`Operator ${filter.operator} requires array value for field: ${filter.field}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
```

### 3. Filter Composition Helpers

```typescript
// Compose filters with logical operations
class FilterComposer {
  static and(...filterGroups: MyFilter[][]): MyFilter[] {
    return filterGroups.flat();
  }

  static or(field: string, values: any[]): MyFilter {
    return {
      field,
      operator: 'in',
      value: values
    };
  }

  static not(field: string, values: any[]): MyFilter {
    return {
      field,
      operator: 'not_in', 
      value: values
    };
  }

  static range(field: string, min?: any, max?: any): MyFilter[] {
    const filters: MyFilter[] = [];

    if (min !== undefined) {
      filters.push({ field, operator: 'gt', value: min });
    }

    if (max !== undefined) {
      filters.push({ field, operator: 'lt', value: max });
    }

    return filters;
  }
}

// Usage example
const filters = FilterComposer.and(
  [FilterComposer.or('status', ['active', 'pending'])],
  FilterComposer.not('tags', ['internal', 'deprecated']),
  FilterComposer.range('created_at', '2023-01-01', '2023-12-31')
);
```

## Key Benefits

 **Composable**: Build complex filters by combining multiple criteria
 **Type-Safe**: Full TypeScript support with comprehensive interfaces
 **Extensible**: Easy to add new fields and operators
 **Consistent**: Same pattern across all filtering operations
 **Reusable**: Filter logic separated from API calls and MCP tools
 **Flexible**: Support for multiple operators and data types
 **Maintainable**: Clear separation of concerns across architecture layers
 **Production-Ready**: Includes validation, error handling, and performance considerations

## Performance Considerations

### 1. Filter Optimization

- **Index Usage**: Ensure filtered fields are indexed in your data store
- **Filter Order**: Place most selective filters first
- **Limit Results**: Always apply reasonable limits to prevent large result sets

### 2. Caching Strategies

```typescript
// Cache frequently used filter combinations
const filterCache = new Map<string, MyFilter[]>();

function getCachedFilters(key: string, builder: () => MyFilter[]): MyFilter[] {
  if (!filterCache.has(key)) {
    filterCache.set(key, builder());
  }
  return filterCache.get(key)!;
}
```

### 3. Pagination Support

```typescript
interface PaginatedQuery extends FilteredQuery {
  page?: number;
  pageSize?: number;
  cursor?: string;
}

interface PaginatedResponse<T> extends FilteredResponse<T> {
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
    nextCursor?: string;
  };
}
```

This filtering system provides a robust foundation for sophisticated query capabilities in any MCP implementation while maintaining clean architecture and excellent developer experience.