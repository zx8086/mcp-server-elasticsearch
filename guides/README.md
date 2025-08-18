# Elasticsearch MCP Server Documentation

## Overview
This directory contains comprehensive documentation for the Elasticsearch MCP Server, organized by topic for easy navigation.

## Documentation Structure

### 📁 [fixes/](./fixes/)
Technical documentation of all fixes and improvements applied to the server.

- **[CONSOLIDATED_FIXES.md](./fixes/CONSOLIDATED_FIXES.md)** - Complete summary of all fixes with implementation details
- **Individual Fix Reports:**
  - [FIX_SUMMARY.md](./fixes/FIX_SUMMARY.md) - Schema conversion fix for z.record(z.any())
  - [PARAMETER_FIX_SUMMARY.md](./fixes/PARAMETER_FIX_SUMMARY.md) - Parameter extraction and handling fixes
  - [RESPONSE_SIZE_FIX_SUMMARY.md](./fixes/RESPONSE_SIZE_FIX_SUMMARY.md) - Response truncation improvements
  - [VALIDATION_FIX_SUMMARY.md](./fixes/VALIDATION_FIX_SUMMARY.md) - Validation flexibility improvements
  - [ILM_TOOL_FIX_SUMMARY.md](./fixes/ILM_TOOL_FIX_SUMMARY.md) - Index Lifecycle Management tool fixes
  - [DEFAULTS_FIX_SUMMARY.md](./fixes/DEFAULTS_FIX_SUMMARY.md) - Default value handling strategy

### 📁 [implementation/](./implementation/)
Technical implementation guides and architectural documentation.

- **Core Guides:**
  - [PARAMETER_HANDLING_GUIDE.md](./implementation/PARAMETER_HANDLING_GUIDE.md) - Comprehensive parameter handling and LLM guidance
  - [MCP_COMPLIANCE_REPORT.md](./implementation/MCP_COMPLIANCE_REPORT.md) - MCP specification compliance analysis
  - [ZOD_MCP_IMPLEMENTATION_GUIDE.md](./implementation/ZOD_MCP_IMPLEMENTATION_GUIDE.md) - Zod schema integration patterns

- **Enhancement Documentation:**
  - [LLM_GUIDANCE_SOLUTION.md](./implementation/LLM_GUIDANCE_SOLUTION.md) - Solutions for MCP SDK parameter issues
  - [NO_DEFAULTS_SOLUTION.md](./implementation/NO_DEFAULTS_SOLUTION.md) - No-defaults philosophy and implementation
  - [TOOL_IMPROVEMENTS.md](./implementation/TOOL_IMPROVEMENTS.md) - Tool enhancement strategies
  - [RESPONSE_HANDLING_IMPROVEMENTS.md](./implementation/RESPONSE_HANDLING_IMPROVEMENTS.md) - Response formatting improvements

- **Advanced Topics:**
  - [ENHANCED_TRACING.md](./implementation/ENHANCED_TRACING.md) - Tracing and debugging capabilities
  - [LANGSMITH_TRACING.md](./implementation/LANGSMITH_TRACING.md) - LangSmith integration for monitoring
  - [FILTER_PATH_EXAMPLES.md](./implementation/FILTER_PATH_EXAMPLES.md) - Elasticsearch filter_path usage

### 📁 [examples/](./examples/)
Query examples and usage patterns for all tools.

- **[QUERY_EXAMPLES.md](./examples/QUERY_EXAMPLES.md)** - Comprehensive query examples for all tools including:
  - Search queries (match, bool, range, aggregations)
  - Index management operations
  - Document operations
  - SQL queries
  - Advanced patterns and troubleshooting

### 📁 [integration/](./integration/)
Integration guides for external systems.

- **n8n Integration:**
  - [N8N_INTEGRATION.md](./integration/N8N_INTEGRATION.md) - Step-by-step n8n setup guide
  - [N8N_TROUBLESHOOTING.md](./integration/N8N_TROUBLESHOOTING.md) - Common n8n issues and solutions
  - [N8N.md](./integration/N8N.md) - Quick reference for n8n configuration

## Quick Links

### Getting Started
1. Review the main [README.md](../README.md) for installation
2. Check [QUERY_EXAMPLES.md](./examples/QUERY_EXAMPLES.md) for usage examples
3. See [PARAMETER_HANDLING_GUIDE.md](./implementation/PARAMETER_HANDLING_GUIDE.md) for parameter details

### Troubleshooting
1. [CONSOLIDATED_FIXES.md](./fixes/CONSOLIDATED_FIXES.md) - Known issues and solutions
2. [N8N_TROUBLESHOOTING.md](./integration/N8N_TROUBLESHOOTING.md) - n8n specific issues
3. [MCP_COMPLIANCE_REPORT.md](./implementation/MCP_COMPLIANCE_REPORT.md) - MCP compatibility

### Integration
1. [N8N_INTEGRATION.md](./integration/N8N_INTEGRATION.md) - n8n setup
2. [LANGSMITH_TRACING.md](./implementation/LANGSMITH_TRACING.md) - Monitoring setup

## Key Concepts

### Parameter Handling
The server uses enhanced tool descriptions to work around MCP SDK limitations. See [PARAMETER_HANDLING_GUIDE.md](./implementation/PARAMETER_HANDLING_GUIDE.md) for details.

### No-Defaults Philosophy
Tools avoid runtime defaults to give LLMs full control. Learn more in [NO_DEFAULTS_SOLUTION.md](./implementation/NO_DEFAULTS_SOLUTION.md).

### Response Management
Smart truncation and dual-format responses ensure usability. See [RESPONSE_HANDLING_IMPROVEMENTS.md](./implementation/RESPONSE_HANDLING_IMPROVEMENTS.md).

## Contributing

When adding new documentation:
1. Place it in the appropriate subdirectory
2. Update this README with a link and description
3. Follow the existing format and structure
4. Include practical examples where applicable

## Document Status

| Category | Documents | Status |
|----------|-----------|--------|
| Fixes | 7 documents | ✅ Complete |
| Implementation | 11 documents | ✅ Complete |
| Examples | 1 document | ✅ Complete |
| Integration | 3 documents | ✅ Complete |

Last Updated: January 2025