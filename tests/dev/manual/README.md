# Development Testing Files

This directory contains test scripts, reports, and logs used during development and debugging of the MCP server.

## Contents

### **Test Scripts**
- `test-debug-logs.ts` - Debug logging tests
- `test-direct-pagination.ts` - Direct pagination testing
- `test-langsmith-tracing.ts` - LangSmith tracing integration tests
- `test-mcp-request-inspection.ts` - MCP request structure inspection
- `test-pagination-fix.ts` - Pagination fix validation
- `test-pagination-integration.ts` - Integration tests for pagination
- `test-pagination-validation.ts` - Parameter validation tests

### **Development Reports**
- `json-to-zod-conversion-report.json` - Detailed schema conversion results
- `working-tests-report.json` - Test execution reports
- `server.log` - Development server logs

### **Test Directories**
- `test-audit-integration/` - Audit integration test files

## Purpose

These files were created during the development process to:
- Debug parameter handling issues
- Test schema conversion fixes
- Validate pagination functionality
- Implement LangSmith tracing
- Perform integration testing

## Cleanup

These files can be safely removed once development is complete, as the knowledge has been captured in the main documentation in the `guides/` directory.