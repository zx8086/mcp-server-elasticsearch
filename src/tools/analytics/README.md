# Analytics Tools

This folder contains text analytics and document analysis tools for Elasticsearch. These tools provide detailed information about term frequency, positions, and document structure for advanced text analysis.

## Available Tools

### Term Vector Analysis
- **`get_term_vectors`** - Get term vectors for a single document
- **`get_multi_term_vectors`** - Get term vectors for multiple documents in batch

## Read-Only Mode Support

All Analytics tools are read-only operations and are always allowed:

- **Read Operations**: All tools in this folder - Always allowed
- **Write Operations**: None
- **Destructive Operations**: None

## Tool Descriptions

### `get_term_vectors`
Analyzes a single document to extract detailed term information including:
- **Term frequencies**: How often each term appears in the document
- **Term positions**: Exact positions of terms within the text
- **Term offsets**: Character-level start and end positions
- **Term payloads**: Additional per-term metadata (if configured)
- **Field statistics**: Document and collection-level term statistics
- **Term statistics**: Global term frequency information across the index

### `get_multi_term_vectors`
Performs batch term vector analysis for multiple documents, providing the same detailed information as the single document version but optimized for bulk operations.

## Use Cases

### Text Analytics
- **Similarity analysis**: Compare document content by analyzing term overlap
- **Content analysis**: Understand document composition and term distribution  
- **Search relevance**: Analyze why documents match or don't match queries
- **Content recommendation**: Build recommendation systems based on term similarity

### Document Understanding
- **Highlighting**: Implement custom highlighting based on term positions
- **Text extraction**: Extract specific terms and their contexts from documents
- **Language detection**: Analyze term patterns for language identification
- **Quality assessment**: Evaluate document richness and term diversity

### Search Optimization
- **Query analysis**: Understand how queries match against document terms
- **Scoring analysis**: Debug and optimize relevance scoring
- **Index analysis**: Understand term distribution across the collection
- **Performance tuning**: Identify frequently accessed terms and patterns

## Advanced Features

### Configurable Analysis
- **Per-field analyzers**: Apply different analysis chains to different fields
- **Real-time analysis**: Analyze documents that haven't been indexed yet
- **Custom filtering**: Filter terms by frequency, length, or other criteria

### Statistical Information
- **Document frequency**: How many documents contain each term
- **Total term frequency**: Total occurrences across all documents
- **Field statistics**: Summary statistics for each analyzed field

## Output Information

Term vectors provide comprehensive information:
```json
{
  "term": "elasticsearch",
  "term_freq": 3,
  "tokens": [
    {
      "position": 5,
      "start_offset": 23,
      "end_offset": 36
    }
  ]
}
```

## Performance Considerations

- Term vector analysis can be computationally intensive for large documents
- Batch operations (`get_multi_term_vectors`) are more efficient for multiple documents
- Consider filtering options to reduce output size for large documents
- Term statistics require additional computation time

## File Structure

```
src/tools/analytics/
├── get_term_vectors.ts       # Single document term analysis
└── get_multi_term_vectors.ts # Batch document term analysis
```

Each tool follows the established patterns for error handling, logging, parameter validation, and provides detailed analytical information for text processing and search optimization.