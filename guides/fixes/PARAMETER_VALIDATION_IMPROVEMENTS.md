# Parameter Validation Improvements for MCP Tools

## Problem Analysis

Based on the screenshots provided, the LLM agent was experiencing several issues when calling Elasticsearch MCP tools:

1. **Missing Required Fields**: Tools were being called with empty `{}` parameters when they required specific fields
2. **Invalid Input Types**: Parameters of wrong types were being passed (e.g., numbers instead of strings)
3. **Undefined/Empty Parameters**: The LLM was passing `undefined` or empty objects
4. **Large Response Errors**: Some responses exceeded the 1MB limit (1048576 bytes)
5. **Unclear Error Messages**: The validation errors weren't providing enough guidance for the LLM to correct itself

## Solutions Implemented

### 1. Enhanced Parameter Validation (`src/utils/parameterValidator.ts`)

Created a comprehensive parameter validation system that:
- Extracts parameter information from Zod schemas
- Provides detailed error messages with field-level specifics
- Generates helpful suggestions for fixing validation errors
- Creates example usage with proper parameter formats

### 2. Default Parameter Suggestions (`src/utils/defaultParameters.ts`)

Implemented smart defaults for commonly used tools:
- Detects when empty parameters are passed to tools that need them
- Provides sensible default values (e.g., `indexPattern: "*"` for list operations)
- Offers tool-specific help messages explaining what parameters are needed
- Shows example parameter structures for complex tools

### 3. Response Size Management (`src/utils/responseHandler.ts`)

Created intelligent response handling to prevent size limit errors:
- Automatically detects responses exceeding 1MB limit
- Intelligently truncates based on response type:
  - Arrays: Shows first N items with count summary
  - Search results: Limits hits and truncates source documents
  - Indices: Groups and summarizes large index lists
- Provides clear truncation messages with suggestions for reducing response size

### 4. Universal Tool Wrapper Enhancements (`src/utils/universalToolWrapper.ts`)

Enhanced the wrapper to:
- Log all incoming parameters for debugging
- Detect empty parameters for tools that typically need configuration
- Provide helpful error messages before validation fails
- Apply response size handling to all tool responses
- Better handle inline Zod validators with comprehensive error messages

## Key Features

### For Empty Parameters
When a tool is called with empty `{}` parameters but needs configuration:
```
⚠️ Tool "elasticsearch_list_indices" was called with empty parameters but typically needs configuration.

This tool requires an index pattern. Use '*' to list all indices, or specify a pattern like 'logs-*'.

Suggested parameters:
{
  "indexPattern": "*",
  "limit": 50,
  "excludeSystemIndices": true,
  "excludeDataStreams": false,
  "sortBy": "name"
}

Please retry with appropriate parameters.
```

### For Validation Errors
When parameters fail validation:
```
Parameter validation failed for tool "elasticsearch_execute_sql_query":

Errors:
  - query: Invalid input: expected string, received number

Suggestions:
  - Parameter "query" must be of type string, but received number

Example:
{
  "query": "SELECT * FROM my-index LIMIT 10"
}
```

### For Large Responses
When responses exceed size limits:
```
Response truncated. Original size: 2048576 bytes, limit: 1048576 bytes.
Showing 500 of 1000 items due to size limits.
Consider using filters, smaller size limits, or the 'summarize' parameter if available.
```

## Tools Enhanced

The following tools now have better parameter handling:
- `elasticsearch_list_indices` - Default pattern "*"
- `elasticsearch_search` - Default index "*" with match_all query
- `elasticsearch_execute_sql_query` - Example SQL query provided
- `elasticsearch_get_mappings` - Default to all indices
- `elasticsearch_ilm_explain_lifecycle` - Default to all indices
- `elasticsearch_index_document` - Example document structure
- `elasticsearch_get_document` - Requires index and ID
- `elasticsearch_delete_by_query` - Example query structure
- `elasticsearch_reindex_documents` - Source/destination example
- And many more...

## Benefits

1. **Better LLM Guidance**: Clear error messages help LLMs understand what went wrong
2. **Reduced Failures**: Default parameters prevent common empty parameter errors
3. **Size Management**: Automatic truncation prevents response size errors
4. **Debugging Support**: Comprehensive logging helps diagnose parameter issues
5. **User-Friendly**: Helpful suggestions make it easier to correct mistakes

## Testing

Run the validation test script to verify the improvements:
```bash
bun scripts/test-parameter-validation.ts
```

This will test various parameter scenarios including:
- Empty parameters
- Invalid types
- Null/undefined parameters
- Valid parameters

## Future Improvements

Potential enhancements could include:
1. Parameter auto-correction for common mistakes
2. LLM-specific parameter hints based on the calling agent
3. Parameter validation caching for performance
4. More intelligent response summarization
5. Tool-specific parameter templates