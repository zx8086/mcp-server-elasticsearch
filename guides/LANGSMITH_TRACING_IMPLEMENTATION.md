# LangSmith Tracing Implementation Guide

This document provides a comprehensive explanation of how LangSmith tracing is implemented in the Elasticsearch MCP Server, including the critical patterns and architectural decisions.

## Table of Contents

1. [⚠️ Critical Bug Fix - MUST READ FIRST](#️-critical-bug-fix---must-read-first)
2. [Overview](#overview)
3. [Architecture](#architecture)
4. [Critical Implementation Details](#critical-implementation-details)
5. [Complete Session Management System](#complete-session-management-system)
6. [Performance Monitoring and Metrics](#performance-monitoring-and-metrics)
7. [Feedback Integration](#feedback-integration)
8. [Nested Operation Tracing](#nested-operation-tracing)
9. [Metadata Creation and Management](#metadata-creation-and-management)
10. [Multi-Transport Integration](#multi-transport-integration)
11. [Tool Registration System](#tool-registration-system)
12. [Dynamic Tool Name Resolution](#dynamic-tool-name-resolution)
13. [Session Grouping and Workflow Tracing](#session-grouping-and-workflow-tracing)
14. [Production Patterns](#production-patterns)
15. [Testing Infrastructure](#testing-infrastructure)
16. [Universal MCP Server Tracing Template](#universal-mcp-server-tracing-template)
17. [Universal Patterns for Any MCP Server](#universal-patterns-for-any-mcp-server)
18. [Troubleshooting](#troubleshooting)

## ⚠️ Critical Bug Fix - MUST READ FIRST

**🔥 CRITICAL**: The LangSmithClient requires explicit project routing to ensure traces go to the correct project. This is essential for proper implementation in any MCP server.

### Essential LangSmith Client Configuration

**✅ REQUIRED Implementation:**
```typescript
langsmithClient = new LangSmithClient({
  apiKey: apiKey,
  apiUrl: endpoint,
  projectName: project, // 🔥 CRITICAL: Explicit project routing parameter
});
```

### Why Project Name Parameter Is Critical

- **Project Routing**: The `projectName` parameter ensures all traces are routed to your specified project
- **Environment Variable Limitation**: Setting `LANGSMITH_PROJECT` environment variable alone is insufficient
- **Constructor Requirement**: The LangSmithClient constructor requires explicit project specification for proper routing
- **Production Impact**: Without this parameter, traces may appear in unexpected projects

### Verification Steps

To verify traces go to the correct project:
1. Check LangSmith dashboard - traces should appear in your specified project
2. Look for debug log: `✅ LangSmith tracing initialized {"project":"your-project-name"}`
3. Verify tool traces include project context in logs

## Overview

The LangSmith tracing system provides comprehensive observability for all MCP tool executions. Every tool call is automatically traced with proper identification, performance metrics, and error handling.

### Key Features
- **Dynamic Tool Names**: Each tool appears with its actual name in traces (e.g., `elasticsearch_search`)
- **Universal Coverage**: ALL tools are traced unconditionally
- **Performance Tracking**: Execution time and performance metrics captured
- **Error Handling**: Comprehensive error tracking and propagation
- **Production Ready**: Graceful degradation when tracing is unavailable
- **Correct Project Routing**: Fixed critical bug for proper project assignment

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Client    │───▶│   MCP Server     │───▶│   LangSmith     │
│   (Claude)      │    │                  │    │   Dashboard     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │  Tool Registration   │
                    │      System          │
                    └──────────────────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │   Tool Execution     │
                    │   Wrapper Layer      │
                    └──────────────────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │  Dynamic Tracing     │
                    │     Function         │
                    └──────────────────────┘
```

## Critical Implementation Details

### 1. Project Configuration and Routing

**⚠️ CRITICAL**: Project configuration is the most common source of tracing issues. Traces often go to the wrong project due to parameter precedence misunderstandings.

#### Environment Variable Precedence (Highest to Lowest Priority)

**🔥 REQUIRED**: Always use explicit project configuration with consistent naming across all components.

```typescript
// 1. HIGHEST: Direct client constructor parameters
const client = new LangSmithClient({
  apiKey: "lsv2_sk_xxx",
  projectName: "my-specific-project" // This OVERRIDES all environment variables
});

// 2. MEDIUM: traceable function parameters
const toolTracer = traceable(handler, {
  name: toolName,
  project_name: "my-specific-project", // Must match client constructor
  run_type: "tool"
});

// 3. LOWEST: Environment variables (fallback only)
process.env.LANGSMITH_PROJECT = "default-project"; // Only used if not specified above
```

#### Essential Project Configuration Pattern

**🔥 REQUIRED Implementation for Consistent Tracing:**

```typescript
const projectName = process.env.LANGSMITH_PROJECT || "default-project";

const client = new LangSmithClient({
  apiKey: apiKey,
  projectName: projectName // 🔥 CRITICAL: Explicit project routing
});

const toolTracer = traceable(handler, {
  name: toolName,
  project_name: projectName, // 🔥 CRITICAL: Same project as client
  run_type: "tool"
});
```

**Why This Pattern Is Essential:**
- **Consistent Routing**: All traces go to the same project
- **No Split Traces**: Client and tool traces appear together
- **Explicit Control**: Override environment variables when needed
- **Fallback Safety**: Always have a default project name

### 2. LangSmith Initialization (`src/utils/tracing.ts`)

```typescript
// LangSmith client initialization with EXPLICIT project configuration
let langsmithClient: LangSmithClient | null = null;
let isTracingEnabled = false;
let configuredProject: string | null = null;

export function initializeTracing(): void {
  const tracingEnabled =
    config.langsmith.tracing || 
    process.env.LANGSMITH_TRACING === "true" || 
    process.env.LANGCHAIN_TRACING_V2 === "true";

  const apiKey = 
    config.langsmith.apiKey || 
    process.env.LANGSMITH_API_KEY || 
    process.env.LANGCHAIN_API_KEY;

  // CRITICAL: Explicit project name resolution
  const projectName = 
    config.langsmith.project ||
    process.env.LANGSMITH_PROJECT ||
    process.env.LANGCHAIN_PROJECT ||
    "mcp-server-default"; // Always have a fallback

  if (!tracingEnabled || !apiKey) {
    logger.info("LangSmith tracing is disabled");
    return;
  }

  try {
    // Set environment variables for LangSmith SDK
    process.env.LANGSMITH_TRACING = "true";
    process.env.LANGCHAIN_TRACING_V2 = "true";
    process.env.LANGSMITH_API_KEY = apiKey;
    process.env.LANGSMITH_PROJECT = projectName; // Ensure env var is set
    
    // Initialize client with EXPLICIT project
    langsmithClient = new LangSmithClient({
      apiKey: apiKey,
      apiUrl: endpoint,
      projectName: projectName // CRITICAL: Explicit project routing
    });

    configuredProject = projectName; // Store for use in traceable functions
    isTracingEnabled = true;
    
    logger.info("✅ LangSmith tracing initialized", {
      project: projectName,
      endpoint: endpoint
    });
  } catch (error) {
    logger.error("Failed to initialize LangSmith tracing", { error });
  }
}

// Export project name for use in traceable functions
export function getConfiguredProject(): string | null {
  return configuredProject;
}
```

**Key Points:**
- **Explicit Project Resolution**: Clear precedence order for project configuration
- **Consistent Project Usage**: Same project name for client and traceable functions
- **Project Validation**: Log the actual project being used
- **Environment Variable Setup**: Ensure all required env vars are set
- **Graceful Fallback**: Always have a default project name

### 3. Dynamic Tool Tracing Function

**🔥 REQUIRED**: Implement dynamic tool names using function-based approach for proper tool identification in traces.

**Essential Implementation Pattern:**

```typescript
export function traceToolExecution(toolName: string, _args: any, handler: () => Promise<any>) {
  // Get the configured project to ensure consistent routing
  const projectName = getConfiguredProject();
  
  // Create a traceable function with the SPECIFIC tool name AND project
  const toolTracer = traceable(
    async () => {
      const startTime = Date.now();
      const currentRun = getCurrentRunTree();

      logger.debug("Executing tool with tracing", {
        toolName,
        project: projectName,
        hasParentTrace: !!currentRun,
        parentTraceId: currentRun?.id,
      });

      try {
        const result = await handler();

        const executionTime = Date.now() - startTime;
        logger.debug("Tool execution completed", {
          toolName,
          project: projectName,
          executionTime,
          hasResult: !!result,
        });

        return {
          ...result,
          _trace: {
            runId: currentRun?.id,
            executionTime,
            project: projectName,
          },
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error("Tool execution failed", {
          toolName,
          project: projectName,
          executionTime,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    {
      name: toolName, // 🔥 CRITICAL: Dynamic tool name for proper identification
      run_type: "tool",
      project_name: projectName, // 🔥 CRITICAL: Ensure traces go to correct project
    }
  );

  return toolTracer();
}
```

**Why This Implementation Is Essential:**
- **Function vs Constant**: Must be a function that creates dynamic instances, not a static constant
- **Dynamic Name Resolution**: Each call creates a new `traceable` with the specific tool name
- **Proper Identification**: Tools appear as `elasticsearch_search`, `elasticsearch_list_indices`, etc.
- **Project Consistency**: Uses the same project name throughout the tracing chain

### 3. Performance and Error Tracking

The tracing function includes comprehensive monitoring:

```typescript
const startTime = Date.now();

try {
  const result = await handler();
  const executionTime = Date.now() - startTime;
  
  // Success tracking with performance metrics
  return {
    ...result,
    _trace: {
      runId: currentRun?.id,
      executionTime,
    },
  };
} catch (error) {
  const executionTime = Date.now() - startTime;
  
  // Error tracking with context
  logger.error("Tool execution failed", {
    toolName,
    executionTime,
    error: error instanceof Error ? error.message : String(error),
  });
  
  throw error; // Re-throw to maintain error propagation
}
```

## Tool Registration System

### Universal Tool Wrapping (`src/tools/index.ts`)

The registration system automatically wraps ALL tools with tracing:

```typescript
export function registerAllTools(server: McpServer, esClient: Client): ToolInfo[] {
  const registeredTools: ToolInfo[] = [];

  // Override the tool method to add automatic tracing and security validation
  const originalTool = server.tool.bind(server);
  server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
    registeredTools.push({ name, description, inputSchema });

    // Skip security validation for read-only operations
    const readOnlyTools = [
      'elasticsearch_search', 
      'elasticsearch_list_indices', 
      'elasticsearch_get_mappings', 
      'elasticsearch_get_shards', 
      'elasticsearch_indices_summary'
    ];
    const shouldValidate = !readOnlyTools.includes(name);
    
    // Create enhanced handler with BOTH tracing AND security validation
    let enhancedHandler = handler;
    
    // Add tracing wrapper to ALL tools (unconditional)
    enhancedHandler = async (args: any) => {
      return traceToolExecution(name, args, async () => {
        return handler(args);
      });
    };
    
    // Add security validation wrapper for write operations
    if (shouldValidate) {
      enhancedHandler = withSecurityValidation(name, enhancedHandler);
    }

    return originalTool(name, description, inputSchema, enhancedHandler);
  };

  logger.info("🚀 Registering all tools with automatic tracing and security validation", {
    tracingEnabled: true, // All tools will be traced
    securityEnabled: true,
  });

  // Register all tools - they automatically get tracing
  registerListIndicesTool(server, esClient);
  registerGetMappingsTool(server, esClient);
  registerSearchTool(server, esClient);
  // ... 94+ tools total

  logger.info("✅ All tools registered with automatic tracing and security validation", {
    toolCount: registeredTools.length,
    tracingActive: true,
    enhancementsEnabled: true,
  });

  return registeredTools;
}
```

**Key Architecture Decisions:**

1. **Server Method Override**: Intercepts `server.tool()` calls to add wrappers
2. **Layered Enhancement**: Tracing + Security validation in sequence
3. **Unconditional Tracing**: Every tool gets traced, no exceptions
4. **Preserved Functionality**: Original tool logic unchanged
5. **Production Safety**: Security validation maintained

### Wrapper Layer Architecture

```
Original Tool Handler
        ↓
    Tracing Wrapper    ← traceToolExecution(name, args, originalHandler)
        ↓
  Security Wrapper     ← withSecurityValidation(name, tracedHandler) [if needed]
        ↓
   MCP Server Tool     ← server.tool(name, description, schema, enhancedHandler)
```

## Dynamic Tool Name Resolution

### The Problem We Solved

Before the fix, all tools appeared as "Tool Execution" in LangSmith because we used static configuration:

```typescript
// Problem: Static configuration
const toolTracer = traceable(handler, {
  name: "Tool Execution", // Same for all tools!
  run_type: "tool"
});
```

### The Solution

Create dynamic `traceable` instances for each tool:

```typescript
// Solution: Dynamic configuration per tool
export function traceToolExecution(toolName: string, _args: any, handler: () => Promise<any>) {
  const toolTracer = traceable(handler, {
    name: toolName, // Different for each tool!
    run_type: "tool"
  });
  return toolTracer();
}
```

### Result in LangSmith Dashboard

**Before (Wrong):**
```
Tool Execution
Tool Execution  
Tool Execution
...
```

**After (Correct):**
```
elasticsearch_search
elasticsearch_get_cluster_health
elasticsearch_list_indices
elasticsearch_get_mappings
...
```

## Production Patterns

### 1. Graceful Degradation

The system works even when LangSmith is unavailable:

```typescript
export function traceToolExecution(toolName: string, _args: any, handler: () => Promise<any>) {
  // If tracing is disabled, just execute the handler directly
  if (!isTracingEnabled) {
    return handler();
  }
  
  // Create traced execution
  const toolTracer = traceable(/* ... */);
  return toolTracer();
}
```

### 2. Performance Monitoring

Built-in performance tracking for slow operations:

```typescript
const executionTime = Date.now() - startTime;

if (executionTime > 10000) {
  logger.warn("Slow tool operation detected", { 
    toolName, 
    duration: executionTime 
  });
}
```

### 3. Error Context Preservation

Errors include rich context for debugging:

```typescript
catch (error) {
  const executionTime = Date.now() - startTime;
  
  logger.error("Tool execution failed", {
    toolName,           // Which tool failed
    executionTime,      // How long it took
    hasParentTrace: !!currentRun,  // Trace context
    parentTraceId: currentRun?.id, // Parent trace
    error: error instanceof Error ? error.message : String(error),
  });
  
  throw error; // Maintain error chain
}
```

### 4. Memory and Resource Efficiency

- **Lazy Initialization**: Tracing only initialized when needed
- **Minimal Overhead**: Direct execution when tracing disabled
- **Resource Cleanup**: Proper cleanup of trace contexts

## Universal Patterns for Any MCP Server

### 1. Basic Implementation Pattern

For any MCP server, use this pattern:

```typescript
import { traceable } from 'langsmith/traceable';

// Universal tool tracing function
export function createToolTracer() {
  return function traceToolExecution(toolName: string, args: any, handler: () => Promise<any>) {
    const toolTracer = traceable(
      async () => {
        const startTime = Date.now();
        
        try {
          const result = await handler();
          const executionTime = Date.now() - startTime;
          
          return {
            ...result,
            _trace: { executionTime, toolName }
          };
        } catch (error) {
          const executionTime = Date.now() - startTime;
          
          // Log error with context
          console.error('Tool execution failed', {
            toolName,
            executionTime,
            error: error.message
          });
          
          throw error;
        }
      },
      {
        name: toolName, // CRITICAL: Dynamic tool name
        run_type: "tool"
      }
    );

    return toolTracer();
  };
}
```

### 2. Server Registration Pattern

```typescript
export function wrapServerWithTracing(server: any) {
  const traceToolExecution = createToolTracer();
  const originalTool = server.tool.bind(server);
  
  // Override tool registration
  server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
    // Wrap with tracing
    const tracedHandler = async (args: any) => {
      return traceToolExecution(name, args, async () => {
        return handler(args);
      });
    };
    
    return originalTool(name, description, inputSchema, tracedHandler);
  };
  
  return server;
}
```

### 3. Environment Configuration

Required environment variables:

```bash
# Enable tracing
LANGSMITH_TRACING=true
LANGCHAIN_TRACING_V2=true

# Authentication
LANGSMITH_API_KEY=your_api_key_here
LANGCHAIN_API_KEY=your_api_key_here

# Configuration
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_PROJECT=your_project_name
```

### 4. Auto-Detection Pattern

```typescript
export function initializeTracing(): boolean {
  const apiKey = process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY;
  const enabled = process.env.LANGSMITH_TRACING === 'true' || process.env.LANGCHAIN_TRACING_V2 === 'true';
  
  if (!enabled || !apiKey) {
    console.log('LangSmith tracing disabled');
    return false;
  }
  
  try {
    // Initialize LangSmith client
    const client = new LangSmithClient({ apiKey });
    console.log('✅ LangSmith tracing initialized');
    return true;
  } catch (error) {
    console.error('Failed to initialize tracing:', error);
    return false;
  }
}
```

## Troubleshooting

### Critical Issues and Solutions

#### 1. **🔥 MOST COMMON: Traces Go to Wrong Project**

**Problem**: Traces appear in default project instead of specified project.

**Root Causes:**
- Client constructor missing `projectName` parameter
- Inconsistent project names between client and traceable functions
- Environment variables not taking effect
- Parameter precedence misunderstanding

**Solution - Full Working Example:**
```typescript
// STEP 1: Environment variable setup
process.env.LANGSMITH_PROJECT = "my-mcp-server";
process.env.LANGSMITH_API_KEY = "lsv2_sk_xxx";
process.env.LANGSMITH_TRACING = "true";

// STEP 2: Resolve project name consistently
const projectName = 
  process.env.LANGSMITH_PROJECT || 
  "fallback-project-name";

// STEP 3: Client initialization with EXPLICIT project
const client = new LangSmithClient({
  apiKey: process.env.LANGSMITH_API_KEY,
  projectName: projectName // CRITICAL: Must be explicit
});

// STEP 4: Traceable function with SAME project
const toolTracer = traceable(
  async () => { /* handler */ },
  {
    name: "my_tool",
    project_name: projectName, // CRITICAL: Must match client
    run_type: "tool"
  }
);
```

**Verification Steps:**
1. Check LangSmith dashboard - project should match expectation
2. Log the resolved project name: `console.log("Using project:", projectName)`
3. Verify both client and traceable use identical project names

#### 2. **Essential `project_name` Parameter in traceable Function**

**🔥 REQUIRED**: Always include explicit `project_name` parameter in traceable functions for consistent routing.

**Essential Implementation:**
```typescript
const toolTracer = traceable(handler, {
  name: toolName,
  run_type: "tool",
  project_name: getConfiguredProject() // 🔥 CRITICAL: Explicit project routing
});
```

**Why This Parameter Is Critical:**
- **Consistent Routing**: Ensures traces go to the same project as the client
- **Override Control**: Prevents environment variable conflicts
- **Explicit Declaration**: Makes project assignment clear and intentional

#### 3. **Client Constructor vs traceable Parameter Confusion**

**Problem**: Mixing up where to set project configuration.

**Parameter Hierarchy (Highest to Lowest Priority):**

```typescript
// 1. HIGHEST: traceable function project_name parameter
const toolTracer = traceable(handler, {
  project_name: "specific-project" // This WINS over everything
});

// 2. MEDIUM: LangSmithClient constructor projectName
const client = new LangSmithClient({
  projectName: "client-project" // Used if traceable doesn't specify
});

// 3. LOWEST: Environment variables
process.env.LANGSMITH_PROJECT = "env-project"; // Fallback only
```

**Best Practice - Use Consistent Configuration:**
```typescript
const projectName = resolveProjectName(); // Single source of truth

// Use same project everywhere
const client = new LangSmithClient({
  projectName: projectName
});

const toolTracer = traceable(handler, {
  project_name: projectName // Same as client
});
```

#### 4. **Environment Variable Precedence Issues**

**Problem**: Environment variables not being read in expected order.

**🔥 REQUIRED Implementation - Explicit Precedence Chain:**
```typescript
function resolveProjectName(): string {
  const sources = [
    { name: "LANGSMITH_PROJECT", value: process.env.LANGSMITH_PROJECT },
    { name: "LANGCHAIN_PROJECT", value: process.env.LANGCHAIN_PROJECT },
    { name: "config.project", value: config.langsmith?.project },
    { name: "default", value: "mcp-server-default" }
  ];
  
  for (const source of sources) {
    if (source.value) {
      console.log(`Using project from ${source.name}: ${source.value}`);
      return source.value;
    }
  }
  
  throw new Error("No project name could be resolved");
}
```

**Why This Pattern Is Essential:**
- **Clear Precedence**: Explicit order of environment variable checking
- **Debugging Support**: Logs which source provided the project name
- **Fallback Safety**: Always provides a project name or fails explicitly
- **Consistent Resolution**: Single function used throughout the application

#### 5. **All Tools Show as "Tool Execution"**

**Problem**: Using static `name` in traceable configuration.

**Solution**: Use dynamic tool names:
```typescript
// Wrong
traceable(handler, { name: "Tool Execution" })

// Right  
traceable(handler, { name: toolName })
```

#### 6. **Tools Not Being Traced**

**Problem**: Conditional tracing or missing wrapper.

**Solution**: Ensure ALL tools are wrapped:
```typescript
// Wrong - conditional
if (isTracingEnabled) {
  enhancedHandler = traceToolExecution(name, args, handler);
}

// Right - unconditional
enhancedHandler = traceToolExecution(name, args, handler);
```

#### 7. **LangSmith Not Receiving Traces**

**Comprehensive Checklist:**
- [ ] `LANGSMITH_TRACING=true` set
- [ ] Valid `LANGSMITH_API_KEY` provided (starts with `lsv2_sk_`)
- [ ] `LANGSMITH_PROJECT` explicitly configured
- [ ] Client constructor includes `projectName` parameter
- [ ] traceable functions include `project_name` parameter
- [ ] Project names are consistent between client and traceable
- [ ] Network connectivity to LangSmith API
- [ ] No firewall blocking outbound connections
- [ ] API key has write permissions to the project

#### 8. **Split Traces Across Multiple Projects**

**Problem**: Some traces go to Project A, others to Project B.

**Root Cause**: Inconsistent project configuration between components.

**Solution**: Centralized project resolution:
```typescript
// Single source of truth
const PROJECT_NAME = resolveProjectName();

// Use everywhere
const client = new LangSmithClient({ projectName: PROJECT_NAME });
const toolTracer = traceable(handler, { project_name: PROJECT_NAME });
const childTracer = traceable(childHandler, { project_name: PROJECT_NAME });
```

### Debug Mode

Enable debug logging to troubleshoot:

```bash
LOG_LEVEL=debug LANGSMITH_TRACING=true bun run dev
```

**Key Log Messages to Watch For:**

**✅ SUCCESS Indicators:**
- `✅ LangSmith tracing initialized` with project name
- `🚀 Registering all tools with automatic tracing`
- `Executing tool with tracing` with project name
- `Tool execution completed` with project name

**🔍 PROJECT ROUTING Debug Messages:**
```bash
# Good - Shows explicit project routing
Using project from LANGSMITH_PROJECT: my-mcp-server
✅ LangSmith tracing initialized {"project":"my-mcp-server"}
Executing tool with tracing {"toolName":"search","project":"my-mcp-server"}

# Bad - Missing project context
✅ LangSmith tracing initialized {}
Executing tool with tracing {"toolName":"search"}
```

**⚠️ WARNING Signs:**
- Missing project name in initialization logs
- Inconsistent project names between messages
- "Failed to initialize LangSmith tracing" errors
- Tools executing without tracing context

**🔍 Project Routing Verification:**
```typescript
// Add this debug logging to your initialization
export function initializeTracing(): void {
  const projectName = resolveProjectName();
  
  console.log("🔍 LangSmith Project Resolution:", {
    resolved: projectName,
    env_langsmith: process.env.LANGSMITH_PROJECT,
    env_langchain: process.env.LANGCHAIN_PROJECT,
    config: config.langsmith?.project
  });
  
  // ... rest of initialization
}
```

## Configuration Reference

### Environment Variables

| Variable | Description | Required | Example | Precedence |
|----------|-------------|----------|---------|------------|
| `LANGSMITH_TRACING` | Enable/disable tracing | Yes | `true` | High |
| `LANGCHAIN_TRACING_V2` | Legacy tracing enable | No | `true` | Medium |
| `LANGSMITH_API_KEY` | LangSmith API key | Yes | `lsv2_sk_abc123...` | High |
| `LANGCHAIN_API_KEY` | Legacy API key | No | `lsv2_sk_abc123...` | Medium |
| `LANGSMITH_PROJECT` | **Project name (CRITICAL)** | **Yes** | `my-mcp-server` | **High** |
| `LANGCHAIN_PROJECT` | Legacy project name | No | `my-mcp-server` | Medium |
| `LANGSMITH_ENDPOINT` | API endpoint | No | `https://api.smith.langchain.com` | Low |
| `LOG_LEVEL` | Debug logging | No | `debug` | N/A |

### Working Configuration Examples

#### Example 1: Simple Environment Setup
```bash
# .env file
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_sk_your_actual_api_key_here
LANGSMITH_PROJECT=kong-mcp-server
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

#### Example 2: Production Configuration
```bash
# Production environment
LANGSMITH_TRACING=true
LANGCHAIN_TRACING_V2=true
LANGSMITH_API_KEY=lsv2_sk_prod_key_here
LANGCHAIN_API_KEY=lsv2_sk_prod_key_here  # Fallback
LANGSMITH_PROJECT=kong-mcp-production
LANGCHAIN_PROJECT=kong-mcp-production    # Fallback
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

#### Example 3: Development with Regional Endpoint
```bash
# Development environment (EU region)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_sk_dev_key_here
LANGSMITH_PROJECT=kong-mcp-development
LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com
LOG_LEVEL=debug
```

### Configuration File

```typescript
// config.ts
export const tracingConfig = {
  langsmith: {
    tracing: process.env.LANGSMITH_TRACING === 'true',
    apiKey: process.env.LANGSMITH_API_KEY,
    project: process.env.LANGSMITH_PROJECT || 'mcp-server',
    endpoint: process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com'
  }
};
```

## Best Practices

### 1. **CRITICAL: Always Configure Projects Explicitly**
```typescript
// Good - Explicit project configuration
const projectName = resolveProjectName(); // Single source of truth

const client = new LangSmithClient({
  apiKey: apiKey,
  projectName: projectName // Explicit routing
});

const toolTracer = traceable(handler, {
  name: toolName,
  project_name: projectName, // Same as client
  run_type: "tool"
});

// Bad - Implicit/missing project configuration
const client = new LangSmithClient({ apiKey }); // No project!
const toolTracer = traceable(handler, { name: toolName }); // No project!
```

### 2. **Always Use Dynamic Names**
```typescript
// Good
const toolTracer = traceable(handler, { name: toolName });

// Bad  
const toolTracer = traceable(handler, { name: "Generic Tool" });
```

### 3. **Implement Graceful Degradation**
```typescript
export function traceToolExecution(toolName, args, handler) {
  if (!isTracingEnabled) {
    return handler(); // Work without tracing
  }
  // ... tracing logic
}
```

### 4. **Centralized Configuration Management**
```typescript
// Good - Single configuration resolver
export function createTracingConfig() {
  const projectName = 
    process.env.LANGSMITH_PROJECT ||
    process.env.LANGCHAIN_PROJECT ||
    'mcp-server-default';
    
  const apiKey = 
    process.env.LANGSMITH_API_KEY ||
    process.env.LANGCHAIN_API_KEY;
    
  return {
    projectName,
    apiKey,
    enabled: process.env.LANGSMITH_TRACING === 'true'
  };
}

// Use everywhere
const config = createTracingConfig();
const client = new LangSmithClient({ 
  projectName: config.projectName,
  apiKey: config.apiKey
});
```

### 5. **Add Performance Monitoring**
```typescript
const executionTime = Date.now() - startTime;
if (executionTime > 5000) {
  logger.warn('Slow tool execution', { toolName, executionTime });
}
```

### 6. **Preserve Error Context**
```typescript
catch (error) {
  logger.error('Tool failed', { 
    toolName, 
    project: projectName, // Include project context
    error: error.message 
  });
  throw error; // Don't swallow errors
}
```

### 7. **Use Structured Logging with Project Context**
```typescript
logger.debug('Tool execution', {
  toolName,
  project: projectName, // Always include project
  hasParentTrace: !!currentRun,
  parentTraceId: currentRun?.id,
  executionTime
});
```

### 8. **Validation and Verification**
```typescript
// Add runtime validation
export function validateTracingConfig(config: TracingConfig): void {
  if (!config.projectName) {
    throw new Error('LANGSMITH_PROJECT must be configured for proper trace routing');
  }
  
  if (!config.apiKey || !config.apiKey.startsWith('lsv2_sk_')) {
    throw new Error('Invalid LANGSMITH_API_KEY format');
  }
  
  console.log('✅ Tracing configuration validated:', {
    project: config.projectName,
    hasApiKey: !!config.apiKey,
    enabled: config.enabled
  });
}
```

## Testing Your Implementation

### 1. Basic Smoke Test
```typescript
// Test that tracing function exists and is callable
import { traceToolExecution } from './src/utils/tracing.js';
console.log('✓ Tracing function imported');
```

### 2. Integration Test
```bash
# Start server with debug logging
LOG_LEVEL=debug bun run dev

# Look for trace initialization messages
# ✅ LangSmith tracing initialized
# 🚀 Registering all tools with automatic tracing
```

### 3. End-to-End Test
1. Start MCP server
2. Execute tools via MCP client
3. Check LangSmith dashboard for traces
4. Verify tool names appear correctly

### 4. Performance Test
```bash
# Run performance test suite
bun run scripts/run-working-tests.ts

# Should maintain 98%+ success rate
```

## Complete Session Management System

The implementation includes a comprehensive session management system using Node.js AsyncLocalStorage that provides context propagation, client identification, and lifecycle management across all async operations.

### Core Session Architecture

The session management system consists of three primary components:

1. **Session Context Storage** - AsyncLocalStorage for context propagation
2. **Client Detection** - Automatic identification of connecting clients
3. **Session Lifecycle Management** - Creation, tracking, and cleanup

### Session Context Interface

```typescript
export interface SessionContext {
  sessionId: string;           // Unique session identifier
  connectionId: string;        // Connection-specific ID
  transportMode: "stdio" | "sse";
  clientInfo?: {
    name?: string;             // e.g., "Claude Desktop", "n8n"
    version?: string;
    platform?: string;
  };
  userId?: string;
  startTime?: number;
}
```

### AsyncLocalStorage Implementation

```typescript
import { AsyncLocalStorage } from "node:async_hooks";

// Global session storage
const sessionStorage = new AsyncLocalStorage<SessionContext>();

/**
 * Run operations within session context
 */
export function runWithSession<T>(context: SessionContext, fn: () => T | Promise<T>): T | Promise<T> {
  return sessionStorage.run(context, fn);
}

/**
 * Get current session from any nested operation
 */
export function getCurrentSession(): SessionContext | undefined {
  const session = sessionStorage.getStore();
  if (!session) {
    logger.debug("No session context available in AsyncLocalStorage");
  }
  return session;
}

/**
 * Get session ID from current context
 */
export function getCurrentSessionId(): string | undefined {
  return getCurrentSession()?.sessionId;
}

/**
 * Get client info from current context
 */
export function getCurrentClientInfo(): SessionContext["clientInfo"] | undefined {
  return getCurrentSession()?.clientInfo;
}
```

### Session Context Factory

```typescript
/**
 * Create a session context object
 */
export function createSessionContext(
  connectionId: string,
  transportMode: "stdio" | "sse",
  sessionId?: string,
  clientInfo?: SessionContext["clientInfo"],
  userId?: string,
): SessionContext {
  return {
    sessionId: sessionId || connectionId,
    connectionId,
    transportMode,
    clientInfo,
    userId,
    startTime: Date.now(),
  };
}
```

### Automatic Client Detection

```typescript
/**
 * Detects the client type from connection context
 */
export function detectClient(
  transportMode: string,
  headers?: Record<string, string>,
  userAgent?: string,
): { name: string; version?: string; platform?: string } {
  // Check for Claude Desktop
  if (transportMode === "stdio") {
    return {
      name: "Claude Desktop",
      platform: process.platform,
    };
  }

  // Check for web clients
  if (transportMode === "sse") {
    if (userAgent) {
      if (userAgent.includes("n8n")) {
        return { name: "n8n", platform: "web" };
      }
      if (userAgent.includes("Chrome")) {
        return { name: "Chrome Browser", platform: "web" };
      }
      if (userAgent.includes("Safari")) {
        return { name: "Safari Browser", platform: "web" };
      }
    }
    return { name: "Web Client", platform: "web" };
  }

  return { name: "Unknown Client", platform: "unknown" };
}
```

### Session ID Generation

```typescript
/**
 * Generates a session ID based on connection context
 */
export function generateSessionId(connectionId: string, clientInfo?: { name?: string }): string {
  const timestamp = Date.now();
  const clientPrefix = clientInfo?.name?.toLowerCase().replace(/\s+/g, "-") || "unknown";
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  return `${clientPrefix}-${timestamp}-${randomSuffix}`;
}

// Example session IDs:
// "claude-desktop-1704067200000-abc123"
// "n8n-1704067200000-xyz789"
// "chrome-browser-1704067200000-def456"
```

### Session Integration with Tracing

All tool executions automatically inherit session context:

```typescript
export function traceToolExecution(toolName: string, args: any, handler: () => Promise<any>) {
  // Get current session context for grouping
  const session = getCurrentSession();
  const project = process.env.LANGSMITH_PROJECT || config.langsmith.project;
  
  const toolTracer = traceable(
    async () => {
      const startTime = Date.now();
      const currentRun = getCurrentRunTree();
      
      logger.debug("Executing tool with session context", {
        toolName,
        project,
        sessionId: session?.sessionId,
        clientName: session?.clientInfo?.name,
        hasParentTrace: !!currentRun,
        parentTraceId: currentRun?.id,
      });
      
      // Tool execution with session context...
      
      return {
        ...result,
        _trace: {
          runId: currentRun?.id,
          executionTime,
          project,
          sessionId: session?.sessionId,
          clientName: session?.clientInfo?.name,
        },
      };
    },
    {
      name: toolName,
      run_type: "tool",
      project_name: project,
      metadata: {
        tool_name: toolName,
        session_id: session?.sessionId,
        connection_id: session?.connectionId,
        client_name: session?.clientInfo?.name,
        client_version: session?.clientInfo?.version,
        transport_mode: session?.transportMode,
      },
      tags: [
        "mcp-tool",
        `tool:${toolName}`,
        session?.clientInfo?.name ? `client:${session.clientInfo.name}` : "client:unknown",
        `transport:${session?.transportMode}`,
      ].filter(Boolean) as string[],
    }
  );
  
  return toolTracer();
}
```

### Session Lifecycle Management

```typescript
/**
 * Log session info for debugging
 */
export function logSessionInfo(prefix = "Session Info") {
  const session = getCurrentSession();
  if (session) {
    logger.debug(`${prefix}:`, {
      sessionId: `${session.sessionId?.substring(0, 10)}...`,
      connectionId: `${session.connectionId?.substring(0, 10)}...`,
      client: session.clientInfo?.name || "unknown",
      transport: session.transportMode,
      duration: session.startTime ? Date.now() - session.startTime : 0,
    });
  } else {
    logger.debug(`${prefix}: No active session`);
  }
}

/**
 * Session cleanup on connection close
 */
export function cleanupSession(sessionId: string) {
  logger.info("Cleaning up session", { sessionId });
  
  const session = getCurrentSession();
  if (session?.startTime) {
    const duration = Date.now() - session.startTime;
    logger.info("Session ended", {
      sessionId,
      duration,
      clientName: session.clientInfo?.name,
      toolCallCount: session.toolCallCount || 0,
    });
  }
}
```

### Usage in MCP Server

```typescript
// In main server initialization
const sessionContext = createSessionContext(
  connectionId,
  "stdio",
  generateSessionId(connectionId, clientInfo),
  detectClient("stdio"),
);

// Wrap all server operations in session context
await runWithSession(sessionContext, async () => {
  // All tool calls within this scope inherit session context
  await server.connect(transport);
});
```

### Benefits of This Session System

1. **Context Propagation**: Session context automatically flows through all async operations
2. **Client Identification**: Automatic detection and tracking of different client types
3. **Debugging**: Rich logging with session context for troubleshooting
4. **Analytics**: Session-level metrics and duration tracking
5. **Tracing Integration**: Session data automatically included in all traces
6. **Resource Management**: Proper cleanup on session end

## Performance Monitoring and Metrics

The implementation includes comprehensive performance monitoring capabilities that track execution times, detect slow operations, and monitor resource usage across all tool executions and session operations.

### PerformanceMonitor Class

```typescript
export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: NodeJS.MemoryUsage;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics;

  constructor() {
    this.metrics = {
      startTime: Date.now(),
      memoryUsage: process.memoryUsage(),
    };
  }

  end(): PerformanceMetrics {
    this.metrics.endTime = Date.now();
    this.metrics.duration = this.metrics.endTime - this.metrics.startTime;
    this.metrics.memoryUsage = process.memoryUsage();
    return this.metrics;
  }

  logSlowOperation(threshold: number, operation: string): void {
    const duration = Date.now() - this.metrics.startTime;
    if (duration > threshold) {
      logger.warn(`Slow operation detected: ${operation}`, {
        duration,
        threshold,
        memoryUsage: process.memoryUsage(),
      });
    }
  }
}
```

### Built-in Performance Tracking

All tool executions automatically include performance monitoring:

```typescript
export function traceToolExecution(toolName: string, args: any, handler: () => Promise<any>) {
  const project = process.env.LANGSMITH_PROJECT || config.langsmith.project;
  const monitor = new PerformanceMonitor(); // Start performance monitoring
  
  const toolTracer = traceable(
    async () => {
      const startTime = Date.now();
      const currentRun = getCurrentRunTree();
      const session = getCurrentSession();
      
      logger.debug("Executing tool with performance monitoring", {
        toolName,
        project,
        sessionId: session?.sessionId,
        memoryUsage: process.memoryUsage(),
      });

      try {
        const result = await handler();
        const executionTime = Date.now() - startTime;
        
        // Check for slow operations
        monitor.logSlowOperation(5000, `${toolName} execution`); // 5 second threshold
        
        // Log performance metrics
        if (executionTime > 1000) { // Log operations over 1 second
          logger.info("Long-running tool execution", {
            toolName,
            executionTime,
            memoryAfter: process.memoryUsage(),
          });
        }

        return {
          ...result,
          _trace: {
            runId: currentRun?.id,
            executionTime,
            project,
            performanceMetrics: monitor.end(),
          },
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        const finalMetrics = monitor.end();
        
        logger.error("Tool execution failed with performance context", {
          toolName,
          project,
          executionTime,
          performanceMetrics: finalMetrics,
          error: error.message,
        });
        throw error;
      }
    },
    {
      name: toolName,
      run_type: "tool",
      project_name: project,
      metadata: {
        performance_monitoring: true,
        memory_tracking: true,
      },
    }
  );

  return toolTracer();
}
```

### Domain-Specific Performance Tracking

For Elasticsearch operations, additional performance metrics are captured:

```typescript
export const traceElasticsearchOperation = traceable(
  async (operation: string, index: string | undefined, query: any, handler: () => Promise<any>) => {
    const monitor = new PerformanceMonitor();
    const startTime = Date.now();
    const initialMemory = process.memoryUsage();

    logger.debug("Executing Elasticsearch operation with performance tracking", {
      operation,
      index,
      hasQuery: !!query,
      initialMemory,
    });

    try {
      const result = await handler();
      const executionTime = Date.now() - startTime;
      const finalMemory = process.memoryUsage();
      
      // Log performance details
      const performanceData = {
        operation,
        index,
        executionTime,
        resultCount: result?.hits?.total?.value || result?.count || 0,
        memoryDelta: {
          rss: finalMemory.rss - initialMemory.rss,
          heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
          heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        }
      };
      
      // Warn on slow Elasticsearch operations
      if (executionTime > 3000) {
        logger.warn("Slow Elasticsearch operation", performanceData);
      } else {
        logger.debug("Elasticsearch operation completed", performanceData);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const finalMetrics = monitor.end();
      
      logger.error("Elasticsearch operation failed", {
        operation,
        index,
        executionTime,
        performanceMetrics: finalMetrics,
        error: error.message,
      });
      throw error;
    }
  },
  {
    name: "Elasticsearch Operation",
    run_type: "retriever",
    metadata: {
      performance_tracking: true,
      domain: "elasticsearch",
    },
  }
);
```

### Session-Level Performance Metrics

Track performance at the session level:

```typescript
export interface SessionMetrics {
  sessionId: string;
  clientInfo: SessionContext["clientInfo"];
  startTime: number;
  endTime?: number;
  duration?: number;
  toolCallCount: number;
  totalExecutionTime: number;
  averageExecutionTime?: number;
  errorCount: number;
  successCount: number;
  memoryPeak?: NodeJS.MemoryUsage;
  slowOperations: Array<{
    toolName: string;
    duration: number;
    timestamp: number;
  }>;
}

export class SessionPerformanceTracker {
  private metrics: SessionMetrics;
  private operationHistory: Array<{ toolName: string; duration: number; success: boolean }> = [];

  constructor(sessionId: string, clientInfo?: SessionContext["clientInfo"]) {
    this.metrics = {
      sessionId,
      clientInfo,
      startTime: Date.now(),
      toolCallCount: 0,
      totalExecutionTime: 0,
      errorCount: 0,
      successCount: 0,
      slowOperations: [],
    };
  }

  recordOperation(toolName: string, duration: number, success: boolean): void {
    this.metrics.toolCallCount++;
    this.metrics.totalExecutionTime += duration;
    
    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.errorCount++;
    }
    
    // Track slow operations (over 2 seconds)
    if (duration > 2000) {
      this.metrics.slowOperations.push({
        toolName,
        duration,
        timestamp: Date.now(),
      });
    }
    
    this.operationHistory.push({ toolName, duration, success });
    
    // Update average execution time
    this.metrics.averageExecutionTime = this.metrics.totalExecutionTime / this.metrics.toolCallCount;
  }

  endSession(): SessionMetrics {
    this.metrics.endTime = Date.now();
    this.metrics.duration = this.metrics.endTime - this.metrics.startTime;
    this.metrics.memoryPeak = process.memoryUsage();
    
    logger.info("Session performance summary", {
      sessionId: this.metrics.sessionId,
      duration: this.metrics.duration,
      toolCallCount: this.metrics.toolCallCount,
      averageExecutionTime: this.metrics.averageExecutionTime,
      successRate: this.metrics.successCount / this.metrics.toolCallCount,
      slowOperationCount: this.metrics.slowOperations.length,
    });
    
    return this.metrics;
  }
}
```

### Automatic Performance Alerts

```typescript
export function checkPerformanceThresholds(metrics: PerformanceMetrics, operation: string): void {
  const { duration, memoryUsage } = metrics;
  
  // Check execution time thresholds
  if (duration) {
    if (duration > 10000) {
      logger.error(`Critical: Very slow operation detected`, {
        operation,
        duration,
        threshold: 10000,
        severity: "critical"
      });
    } else if (duration > 5000) {
      logger.warn(`Warning: Slow operation detected`, {
        operation,
        duration,
        threshold: 5000,
        severity: "warning"
      });
    }
  }
  
  // Check memory usage thresholds
  if (memoryUsage) {
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const rssMB = memoryUsage.rss / 1024 / 1024;
    
    if (heapUsedMB > 500) {
      logger.warn("High heap usage detected", {
        operation,
        heapUsedMB,
        rssMB,
        threshold: 500
      });
    }
    
    if (rssMB > 1000) {
      logger.error("Critical memory usage", {
        operation,
        rssMB,
        threshold: 1000,
        severity: "critical"
      });
    }
  }
}
```

### Performance Monitoring Integration

Integrate performance monitoring into the tool registration system:

```typescript
// In tool registration, wrap all tools with performance monitoring
server.tool = (name: string, description: string, inputSchema: any, handler: any) => {
  const performanceWrapper = async (args: any) => {
    const monitor = new PerformanceMonitor();
    
    try {
      // Execute with tracing and performance monitoring
      const result = await traceToolExecution(name, args, async () => {
        return handler(args);
      });
      
      const metrics = monitor.end();
      checkPerformanceThresholds(metrics, name);
      
      return result;
    } catch (error) {
      const metrics = monitor.end();
      checkPerformanceThresholds(metrics, name);
      throw error;
    }
  };
  
  return originalTool(name, description, inputSchema, performanceWrapper);
};
```

### Benefits of Performance Monitoring

1. **Proactive Issue Detection**: Automatically detects slow operations before they become problems
2. **Resource Usage Tracking**: Monitors memory consumption patterns
3. **Session Analytics**: Provides insights into session-level performance
4. **Elasticsearch Optimization**: Domain-specific performance tracking for database operations
5. **Automated Alerting**: Built-in thresholds for performance alerts
6. **Historical Tracking**: Maintains performance history for trend analysis

## Feedback Integration

The implementation includes a comprehensive feedback system that allows submitting user ratings, comments, and metadata to LangSmith for trace quality assessment and continuous improvement.

### Core Feedback Functionality

```typescript
export async function submitFeedback(
  runId: string,
  score: -1 | 0 | 1,
  comment?: string,
  metadata?: Record<string, any>,
): Promise<void> {
  if (!isTracingEnabled || !langsmithClient) {
    logger.debug("Cannot submit feedback: tracing not enabled");
    return;
  }

  try {
    await langsmithClient.createFeedback(runId, "user_rating", {
      score,
      comment,
      sourceInfo: {
        ...metadata,
        timestamp: new Date().toISOString(),
        source: "mcp-elasticsearch-server",
        version: process.env.npm_package_version || "unknown",
      },
    });

    logger.debug("Feedback submitted successfully", {
      runId,
      score,
      hasComment: !!comment,
      metadataKeys: metadata ? Object.keys(metadata) : [],
    });
  } catch (error) {
    logger.error("Failed to submit feedback", {
      runId,
      score,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

### Automatic Feedback Collection

Feedback can be automatically collected based on performance metrics and error conditions:

```typescript
export function autoSubmitPerformanceFeedback(
  runId: string, 
  toolName: string,
  executionTime: number,
  error?: Error
): void {
  let score: -1 | 0 | 1;
  let comment: string;
  
  if (error) {
    score = -1;
    comment = `Tool ${toolName} failed: ${error.message}`;
  } else if (executionTime > 5000) {
    score = -1;
    comment = `Tool ${toolName} was very slow: ${executionTime}ms`;
  } else if (executionTime > 2000) {
    score = 0;
    comment = `Tool ${toolName} was slow: ${executionTime}ms`;
  } else {
    score = 1;
    comment = `Tool ${toolName} executed successfully in ${executionTime}ms`;
  }
  
  // Submit feedback asynchronously
  submitFeedback(runId, score, comment, {
    toolName,
    executionTime,
    hasError: !!error,
    errorType: error?.constructor?.name,
  }).catch(err => {
    logger.debug("Background feedback submission failed", { err });
  });
}
```

### Integration with Tool Execution

Feedback can be automatically submitted for all tool executions:

```typescript
export function traceToolExecution(toolName: string, args: any, handler: () => Promise<any>) {
  const toolTracer = traceable(
    async () => {
      const startTime = Date.now();
      const currentRun = getCurrentRunTree();
      
      try {
        const result = await handler();
        const executionTime = Date.now() - startTime;
        
        // Auto-submit positive feedback for fast successful operations
        if (currentRun?.id && executionTime < 1000) {
          autoSubmitPerformanceFeedback(currentRun.id, toolName, executionTime);
        }
        
        return {
          ...result,
          _trace: {
            runId: currentRun?.id,
            executionTime,
            feedbackSubmitted: executionTime < 1000,
          },
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Auto-submit negative feedback for errors
        if (currentRun?.id) {
          autoSubmitPerformanceFeedback(currentRun.id, toolName, executionTime, error);
        }
        
        throw error;
      }
    },
    {
      name: toolName,
      run_type: "tool",
      metadata: {
        feedback_enabled: true,
      },
    }
  );

  return toolTracer();
}
```

### Session-Level Feedback

Collect feedback at the session level for overall experience assessment:

```typescript
export async function submitSessionFeedback(
  sessionId: string,
  sessionMetrics: SessionMetrics
): Promise<void> {
  const session = getCurrentSession();
  const sessionRun = getCurrentRunTree();
  
  if (!sessionRun?.id) return;
  
  // Calculate session score based on metrics
  let score: -1 | 0 | 1;
  const successRate = sessionMetrics.successCount / sessionMetrics.toolCallCount;
  const averageTime = sessionMetrics.averageExecutionTime || 0;
  
  if (successRate < 0.8 || averageTime > 3000) {
    score = -1;
  } else if (successRate < 0.95 || averageTime > 1000) {
    score = 0;
  } else {
    score = 1;
  }
  
  const comment = `Session completed: ${sessionMetrics.successCount}/${sessionMetrics.toolCallCount} tools succeeded, avg time ${averageTime.toFixed(0)}ms`;
  
  await submitFeedback(sessionRun.id, score, comment, {
    sessionId,
    clientName: session?.clientInfo?.name,
    toolCallCount: sessionMetrics.toolCallCount,
    successRate,
    averageExecutionTime: averageTime,
    slowOperationCount: sessionMetrics.slowOperations.length,
    sessionDuration: sessionMetrics.duration,
  });
}
```

### Custom Feedback Categories

Support different types of feedback beyond user ratings:

```typescript
export async function submitCustomFeedback(
  runId: string,
  feedbackType: "accuracy" | "helpfulness" | "speed" | "user_rating",
  data: {
    score?: -1 | 0 | 1;
    rating?: number;
    comment?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  if (!isTracingEnabled || !langsmithClient) return;
  
  try {
    await langsmithClient.createFeedback(runId, feedbackType, {
      score: data.score,
      rating: data.rating,
      comment: data.comment,
      sourceInfo: {
        ...data.metadata,
        timestamp: new Date().toISOString(),
        source: "mcp-elasticsearch-server",
        feedbackType,
      },
    });
    
    logger.debug(`${feedbackType} feedback submitted`, { runId });
  } catch (error) {
    logger.error(`Failed to submit ${feedbackType} feedback`, { runId, error });
  }
}

// Usage examples:
// await submitCustomFeedback(runId, "accuracy", { score: 1, comment: "Results were accurate" });
// await submitCustomFeedback(runId, "helpfulness", { rating: 4, comment: "Very helpful response" });
// await submitCustomFeedback(runId, "speed", { score: -1, comment: "Too slow for interactive use" });
```

### Feedback Analytics

Track feedback patterns for continuous improvement:

```typescript
export interface FeedbackSummary {
  totalFeedback: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  averageScore: number;
  commonIssues: Array<{
    issue: string;
    count: number;
    tools: string[];
  }>;
}

export class FeedbackAnalyzer {
  private feedbackHistory: Array<{
    runId: string;
    toolName: string;
    score: number;
    comment?: string;
    timestamp: number;
  }> = [];
  
  recordFeedback(runId: string, toolName: string, score: number, comment?: string): void {
    this.feedbackHistory.push({
      runId,
      toolName,
      score,
      comment,
      timestamp: Date.now(),
    });
  }
  
  generateSummary(timeWindowMs: number = 24 * 60 * 60 * 1000): FeedbackSummary {
    const cutoff = Date.now() - timeWindowMs;
    const recentFeedback = this.feedbackHistory.filter(f => f.timestamp > cutoff);
    
    const summary: FeedbackSummary = {
      totalFeedback: recentFeedback.length,
      positiveCount: recentFeedback.filter(f => f.score > 0).length,
      neutralCount: recentFeedback.filter(f => f.score === 0).length,
      negativeCount: recentFeedback.filter(f => f.score < 0).length,
      averageScore: recentFeedback.reduce((sum, f) => sum + f.score, 0) / recentFeedback.length || 0,
      commonIssues: [],
    };
    
    // Analyze common issues from negative feedback
    const negativeComments = recentFeedback
      .filter(f => f.score < 0 && f.comment)
      .map(f => ({ comment: f.comment!, toolName: f.toolName }));
    
    // Group by common patterns
    const issuePatterns = new Map<string, { count: number; tools: Set<string> }>();
    
    negativeComments.forEach(({ comment, toolName }) => {
      if (comment.includes("slow")) {
        const pattern = "Performance: Slow execution";
        if (!issuePatterns.has(pattern)) {
          issuePatterns.set(pattern, { count: 0, tools: new Set() });
        }
        issuePatterns.get(pattern)!.count++;
        issuePatterns.get(pattern)!.tools.add(toolName);
      }
      
      if (comment.includes("failed") || comment.includes("error")) {
        const pattern = "Reliability: Execution failures";
        if (!issuePatterns.has(pattern)) {
          issuePatterns.set(pattern, { count: 0, tools: new Set() });
        }
        issuePatterns.get(pattern)!.count++;
        issuePatterns.get(pattern)!.tools.add(toolName);
      }
    });
    
    summary.commonIssues = Array.from(issuePatterns.entries())
      .map(([issue, data]) => ({
        issue,
        count: data.count,
        tools: Array.from(data.tools),
      }))
      .sort((a, b) => b.count - a.count);
    
    return summary;
  }
}
```

### Benefits of Feedback Integration

1. **Continuous Improvement**: Automated feedback collection for performance optimization
2. **Quality Assessment**: Track the quality and effectiveness of tool responses
3. **Issue Detection**: Identify common problems through feedback analysis
4. **Performance Correlation**: Link feedback to performance metrics
5. **User Experience**: Capture user satisfaction and experience data
6. **Tool Optimization**: Identify which tools need improvement based on feedback patterns

## Session Grouping and Workflow Tracing

Building on the session management system, the implementation provides sophisticated session grouping and workflow-level tracing that enables grouping related tool calls and tracking complex multi-step operations.

### Session-Level Tracing Architecture

The system implements a three-tiered tracing hierarchy:

```
Session/Connection Level (Parent Trace)
    ↓
Tool Execution Level (Child Traces)
    ↓
Sub-operation Level (Grandchild Traces)
```

#### 1. Session Context Management

The session system uses Node.js AsyncLocalStorage to maintain context across async operations:

```typescript
// Session context structure
export interface SessionContext {
  sessionId: string;           // Unique session identifier
  connectionId: string;        // Connection-specific ID
  transportMode: "stdio" | "sse";
  clientInfo?: {
    name?: string;             // e.g., "Claude Desktop", "n8n"
    version?: string;
    platform?: string;
  };
  userId?: string;
  startTime?: number;
}

// Session storage using AsyncLocalStorage
const sessionStorage = new AsyncLocalStorage<SessionContext>();

// Run operations within session context
export function runWithSession<T>(context: SessionContext, fn: () => T | Promise<T>): T | Promise<T> {
  return sessionStorage.run(context, fn);
}

// Get current session from any nested operation
export function getCurrentSession(): SessionContext | undefined {
  return sessionStorage.getStore();
}
```

#### 2. Named Session Traces

Sessions are automatically traced with descriptive names based on client information:

```typescript
/**
 * Creates properly named session traces for better identification
 */
export function createNamedConnectionTrace(context: ConnectionContext) {
  let traceName = "";
  
  // Client identification
  if (context.clientInfo?.name) {
    traceName = `${context.clientInfo.name}`;
    if (context.clientInfo.version) {
      traceName += ` v${context.clientInfo.version}`;
    }
  } else if (context.transportMode === "stdio") {
    traceName = "Claude Desktop";
  } else if (context.transportMode === "sse") {
    traceName = "Web Client";
  }
  
  // Transport mode and session identifier
  traceName += ` (${context.transportMode.toUpperCase()})`;
  
  if (context.sessionId) {
    const sessionParts = context.sessionId.split("-");
    const sessionIdentifier = sessionParts.length > 2
      ? sessionParts[sessionParts.length - 1].substring(0, 6)
      : context.sessionId.substring(0, 8);
    traceName += ` [${sessionIdentifier}]`;
  }
  
  return traceName;
}

// Example trace names:
// "Claude Desktop (STDIO) [a1b2c3]"
// "n8n v1.0.0 (SSE) [xyz789]"
// "Web Client (SSE) [def456]"
```

#### 3. Session-Level Trace Creation

The session tracing wrapper creates parent traces for all tool operations:

```typescript
export const traceNamedMcpConnection = (context: ConnectionContext) => {
  const traceName = createNamedConnectionTrace(context);
  
  return traceable(
    async (handler: () => Promise<any>) => {
      const startTime = Date.now();
      
      logger.info(`🔗 Starting MCP session: ${traceName}`, {
        connectionId: context.connectionId,
        transportMode: context.transportMode,
        clientInfo: context.clientInfo,
        sessionId: context.sessionId,
      });
      
      try {
        const result = await handler();
        const executionTime = Date.now() - startTime;
        
        logger.info(`✅ MCP session established: ${traceName}`, {
          executionTime
        });
        
        return result;
      } catch (error) {
        logger.error(`❌ MCP session failed: ${traceName}`, { error });
        throw error;
      }
    },
    {
      name: traceName,
      run_type: "chain",                    // Parent trace type
      metadata: {
        connection_id: context.connectionId,
        transport_mode: context.transportMode,
        client_name: context.clientInfo?.name || "unknown",
        client_version: context.clientInfo?.version || "unknown",
        session_id: context.sessionId,
        user_id: context.userId,
      },
      tags: [
        "mcp-connection",
        `transport:${context.transportMode}`,
        context.clientInfo?.name ? `client:${context.clientInfo.name}` : "client:unknown",
      ],
    }
  );
};
```

#### 4. Tool Execution Within Sessions

Tools are traced as child operations of the session, inheriting the parent context:

```typescript
export function traceToolExecution(toolName: string, args: any, handler: () => Promise<any>) {
  // Get current session context for grouping
  const session = getCurrentSession();
  const projectName = getConfiguredProject();
  
  const toolTracer = traceable(
    async () => {
      const startTime = Date.now();
      const currentRun = getCurrentRunTree(); // Gets parent session trace
      
      logger.debug("Executing tool with session context", {
        toolName,
        project: projectName,
        sessionId: session?.sessionId,
        hasParentTrace: !!currentRun,
        parentTraceId: currentRun?.id,
      });
      
      try {
        const result = await handler();
        const executionTime = Date.now() - startTime;
        
        return {
          ...result,
          _trace: {
            runId: currentRun?.id,           // Parent session trace ID
            executionTime,
            project: projectName,
            sessionId: session?.sessionId,   // Session grouping identifier
          },
        };
      } catch (error) {
        logger.error("Tool execution failed", {
          toolName,
          project: projectName,
          sessionId: session?.sessionId,
          error: error.message
        });
        throw error;
      }
    },
    {
      name: toolName,                        // Dynamic tool name
      run_type: "tool",                      // Child trace type
      project_name: projectName,             // Consistent project routing
      metadata: {
        tool_name: toolName,
        session_id: session?.sessionId,      // Session grouping metadata
        connection_id: session?.connectionId,
        client_name: session?.clientInfo?.name,
      },
      tags: [
        "mcp-tool",
        `tool:${toolName}`,
        session?.clientInfo?.name ? `client:${session.clientInfo.name}` : null,
      ].filter(Boolean) as string[],
    }
  );
  
  return toolTracer();
}
```

### Workflow-Level Tracing Patterns

For complex multi-step operations, the system supports workflow tracing:

#### 1. Sequential Workflow Pattern

```typescript
/**
 * Trace a sequence of related operations as a workflow
 */
export async function traceWorkflow<T>(
  workflowName: string,
  steps: Array<{ name: string; operation: () => Promise<any> }>,
  options?: { metadata?: Record<string, any>; tags?: string[] }
): Promise<T[]> {
  const session = getCurrentSession();
  
  const workflowTracer = traceable(
    async () => {
      const startTime = Date.now();
      const results: any[] = [];
      
      logger.info(`🔄 Starting workflow: ${workflowName}`, {
        stepCount: steps.length,
        sessionId: session?.sessionId,
      });
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepStartTime = Date.now();
        
        try {
          logger.debug(`▶️  Workflow step ${i + 1}/${steps.length}: ${step.name}`);
          const result = await step.operation();
          const stepExecutionTime = Date.now() - stepStartTime;
          
          results.push({
            step: step.name,
            result,
            executionTime: stepExecutionTime,
            success: true,
          });
          
          logger.debug(`✅ Workflow step completed: ${step.name} (${stepExecutionTime}ms)`);
        } catch (error) {
          const stepExecutionTime = Date.now() - stepStartTime;
          
          logger.error(`❌ Workflow step failed: ${step.name}`, {
            executionTime: stepExecutionTime,
            error: error.message,
          });
          
          results.push({
            step: step.name,
            error: error.message,
            executionTime: stepExecutionTime,
            success: false,
          });
          
          throw error; // Fail fast for workflows
        }
      }
      
      const totalExecutionTime = Date.now() - startTime;
      
      logger.info(`🎉 Workflow completed: ${workflowName}`, {
        totalExecutionTime,
        stepCount: steps.length,
        sessionId: session?.sessionId,
      });
      
      return results;
    },
    {
      name: `🔄 ${workflowName}`,
      run_type: "chain",
      project_name: getConfiguredProject(),
      metadata: {
        workflow_name: workflowName,
        step_count: steps.length,
        session_id: session?.sessionId,
        connection_id: session?.connectionId,
        ...options?.metadata,
      },
      tags: [
        "mcp-workflow",
        `workflow:${workflowName}`,
        `steps:${steps.length}`,
        ...(options?.tags || []),
      ],
    }
  );
  
  return workflowTracer();
}

// Usage example:
const results = await traceWorkflow("Index Setup and Validation", [
  {
    name: "Check index exists",
    operation: () => indexExists(indexName)
  },
  {
    name: "Create index if missing", 
    operation: () => createIndexIfNeeded(indexName, mapping)
  },
  {
    name: "Validate mapping",
    operation: () => validateIndexMapping(indexName)
  },
  {
    name: "Index sample data",
    operation: () => indexTestDocuments(indexName, sampleData)
  }
]);
```

#### 2. Parallel Operations Pattern

```typescript
/**
 * Trace parallel operations with aggregated results
 */
export async function traceParallelOperations<T>(
  operationName: string,
  operations: Array<{ name: string; operation: () => Promise<any> }>,
  options?: { metadata?: Record<string, any>; tags?: string[] }
): Promise<T[]> {
  const session = getCurrentSession();
  
  const parallelTracer = traceable(
    async () => {
      const startTime = Date.now();
      
      logger.info(`⚡ Starting parallel operations: ${operationName}`, {
        operationCount: operations.length,
        sessionId: session?.sessionId,
      });
      
      try {
        // Execute all operations in parallel
        const promises = operations.map(async (op, index) => {
          const opStartTime = Date.now();
          
          try {
            const result = await op.operation();
            const opExecutionTime = Date.now() - opStartTime;
            
            logger.debug(`✅ Parallel operation completed: ${op.name} (${opExecutionTime}ms)`);
            
            return {
              name: op.name,
              index,
              result,
              executionTime: opExecutionTime,
              success: true,
            };
          } catch (error) {
            const opExecutionTime = Date.now() - opStartTime;
            
            logger.error(`❌ Parallel operation failed: ${op.name}`, {
              executionTime: opExecutionTime,
              error: error.message,
            });
            
            return {
              name: op.name,
              index,
              error: error.message,
              executionTime: opExecutionTime,
              success: false,
            };
          }
        });
        
        const results = await Promise.all(promises);
        const totalExecutionTime = Date.now() - startTime;
        const successCount = results.filter(r => r.success).length;
        
        logger.info(`🎉 Parallel operations completed: ${operationName}`, {
          totalExecutionTime,
          operationCount: operations.length,
          successCount,
          failureCount: operations.length - successCount,
          sessionId: session?.sessionId,
        });
        
        return results;
      } catch (error) {
        logger.error(`❌ Parallel operations failed: ${operationName}`, { error });
        throw error;
      }
    },
    {
      name: `⚡ ${operationName}`,
      run_type: "chain",
      project_name: getConfiguredProject(),
      metadata: {
        operation_name: operationName,
        operation_count: operations.length,
        execution_mode: "parallel",
        session_id: session?.sessionId,
        connection_id: session?.connectionId,
        ...options?.metadata,
      },
      tags: [
        "mcp-parallel",
        `parallel:${operationName}`,
        `operations:${operations.length}`,
        ...(options?.tags || []),
      ],
    }
  );
  
  return parallelTracer();
}

// Usage example:
const results = await traceParallelOperations("Multi-Index Health Check", [
  { name: "logs-* health", operation: () => checkIndexHealth("logs-*") },
  { name: "metrics-* health", operation: () => checkIndexHealth("metrics-*") },
  { name: "traces-* health", operation: () => checkIndexHealth("traces-*") },
]);
```

### Parent-Child Trace Relationships

The system automatically establishes proper parent-child relationships using LangSmith's `getCurrentRunTree()`:

```typescript
// In session establishment (parent trace)
const tracedConnection = traceNamedMcpConnection(sessionContext);
await tracedConnection(async () => {
  // All tool calls within this scope become children
  
  // Tool execution (child trace)
  const searchResult = await traceToolExecution("elasticsearch_search", args, () => {
    return esClient.search(searchParams);
  });
  
  // Another tool execution (sibling child trace)  
  const mappingResult = await traceToolExecution("elasticsearch_get_mappings", args, () => {
    return esClient.indices.getMapping();
  });
  
  // Workflow execution (child trace with its own children)
  const workflowResult = await traceWorkflow("Data Analysis Pipeline", [
    { name: "Search documents", operation: () => searchDocuments() },
    { name: "Analyze results", operation: () => analyzeResults() },
    { name: "Generate report", operation: () => generateReport() }
  ]);
});
```

**Trace Hierarchy in LangSmith:**
```
📊 Claude Desktop (STDIO) [a1b2c3]                    [run_type: "chain"]
├── 📊 elasticsearch_search                            [run_type: "tool", parent: session]
├── 📊 elasticsearch_get_mappings                      [run_type: "tool", parent: session]
└── 🔄 Data Analysis Pipeline                          [run_type: "chain", parent: session]
    ├── 📊 Search documents                            [run_type: "tool", parent: workflow]
    ├── 📊 Analyze results                             [run_type: "tool", parent: workflow]
    └── 📊 Generate report                             [run_type: "tool", parent: workflow]
```

### Session Grouping in LangSmith Dashboard

#### 1. Grouping by Session ID

All traces within a session share the same `session_id` metadata, enabling dashboard filtering:

```typescript
// Metadata structure for grouping
metadata: {
  session_id: "claude-desktop-1704067200000-abc123",
  connection_id: "conn-xyz789", 
  client_name: "Claude Desktop",
  client_version: "1.0.0",
  transport_mode: "stdio",
}
```

**Dashboard Query Examples:**
- Filter by session: `metadata.session_id = "claude-desktop-1704067200000-abc123"`
- Filter by client: `tags.client:Claude Desktop`
- Filter by transport: `tags.transport:stdio`

#### 2. Enhanced Search and Filtering

The system provides rich metadata for powerful dashboard queries:

```typescript
// Tool-level tags for filtering
tags: [
  "mcp-tool",                    // All MCP tool operations
  "tool:elasticsearch_search",   // Specific tool type  
  "client:Claude Desktop",       // Client identification
  "session:a1b2c3",             // Session grouping
]

// Session-level tags
tags: [
  "mcp-connection",             // All MCP sessions
  "transport:stdio",            // Transport mode
  "client:Claude Desktop",      // Client type
]

// Workflow-level tags  
tags: [
  "mcp-workflow",               // All workflow operations
  "workflow:Data Analysis",     // Specific workflow
  "steps:3",                    // Step count
]
```

#### 3. Time-based Session Analysis

Sessions include timing information for performance analysis:

```typescript
// Session duration tracking
const sessionDuration = session.startTime ? Date.now() - session.startTime : 0;

// Tool execution time within session context
const toolExecutionTime = Date.now() - startTime;

// Workflow step timing
const stepExecutionTime = Date.now() - stepStartTime;
```

### Testing Session Grouping

#### 1. Session Context Verification

```typescript
// Test session context propagation
describe("Session Context Propagation", () => {
  test("should maintain session context across async operations", async () => {
    const sessionContext = createSessionContext(
      "test-connection-123",
      "stdio", 
      "test-session-456",
      { name: "Test Client", version: "1.0.0" }
    );
    
    await runWithSession(sessionContext, async () => {
      // Verify session context is available
      const currentSession = getCurrentSession();
      expect(currentSession?.sessionId).toBe("test-session-456");
      expect(currentSession?.clientInfo?.name).toBe("Test Client");
      
      // Execute tool within session
      const result = await traceToolExecution("test_tool", {}, async () => {
        // Verify session context is still available in nested operation
        const nestedSession = getCurrentSession();
        expect(nestedSession?.sessionId).toBe("test-session-456");
        return { success: true };
      });
      
      expect(result.success).toBe(true);
    });
  });
});
```

#### 2. Parent-Child Relationship Testing

```typescript
// Test trace hierarchy
describe("Trace Hierarchy", () => {
  test("should create proper parent-child relationships", async () => {
    const sessionContext = createSessionContext("conn-123", "stdio", "session-456");
    
    await runWithSession(sessionContext, async () => {
      // Mock LangSmith getCurrentRunTree
      const mockParentRun = { id: "parent-trace-123" };
      jest.spyOn(require("langsmith/singletons/traceable"), "getCurrentRunTree")
        .mockReturnValue(mockParentRun);
      
      const result = await traceToolExecution("test_tool", {}, async () => {
        // Verify parent trace is detected
        const currentRun = getCurrentRunTree();
        expect(currentRun?.id).toBe("parent-trace-123");
        return { data: "test" };
      });
      
      // Verify trace metadata includes parent relationship
      expect(result._trace?.runId).toBe("parent-trace-123");
      expect(result._trace?.sessionId).toBe("session-456");
    });
  });
});
```

#### 3. Workflow Tracing Testing

```typescript
// Test workflow execution tracking
describe("Workflow Tracing", () => {
  test("should trace multi-step workflows correctly", async () => {
    const sessionContext = createSessionContext("conn-123", "stdio", "session-456");
    
    await runWithSession(sessionContext, async () => {
      const steps = [
        { name: "Step 1", operation: async () => ({ step1: "complete" }) },
        { name: "Step 2", operation: async () => ({ step2: "complete" }) },
        { name: "Step 3", operation: async () => ({ step3: "complete" }) },
      ];
      
      const results = await traceWorkflow("Test Workflow", steps);
      
      expect(results).toHaveLength(3);
      expect(results[0].step).toBe("Step 1");
      expect(results[0].success).toBe(true);
      expect(results[2].step).toBe("Step 3");
      expect(results[2].success).toBe(true);
    });
  });
});
```

### Production Session Management

#### 1. Session Cleanup and Resource Management

```typescript
// Session cleanup on connection close
export function cleanupSession(sessionId: string) {
  logger.info("Cleaning up session", { sessionId });
  
  // Clear any session-specific caches
  sessionCache.delete(sessionId);
  
  // Record session duration for analytics
  const session = getCurrentSession();
  if (session?.startTime) {
    const duration = Date.now() - session.startTime;
    logger.info("Session ended", {
      sessionId,
      duration,
      clientName: session.clientInfo?.name
    });
  }
}
```

#### 2. Session Metrics and Analytics

```typescript
// Session-level metrics
export interface SessionMetrics {
  sessionId: string;
  clientInfo: SessionContext["clientInfo"];
  startTime: number;
  toolCallCount: number;
  totalExecutionTime: number;
  errorCount: number;
  successCount: number;
}

// Track session metrics
export function updateSessionMetrics(sessionId: string, metrics: Partial<SessionMetrics>) {
  // Update session-level counters and timing
  // Could be stored in Redis, database, or local cache
}
```

## Conclusion

The LangSmith tracing implementation provides comprehensive observability for MCP servers with these key benefits:

- **Dynamic Tool Identification**: Each tool appears with its actual name
- **Universal Coverage**: All tools traced automatically  
- **Session Grouping**: Related operations grouped by session with client identification
- **Parent-Child Relationships**: Proper trace hierarchy for complex workflows
- **Workflow Tracking**: Multi-step operation tracing with parallel and sequential patterns
- **Production Ready**: Graceful degradation and error handling
- **Performance Monitoring**: Built-in execution time tracking at all levels
- **Maintainable Architecture**: Clean separation of concerns with session context propagation

The critical insights for comprehensive tracing are:

1. **Dynamic Tool Names**: Using actual tool names instead of static "Tool Execution"
2. **Session Context Management**: AsyncLocalStorage for context propagation
3. **Parent-Child Relationships**: Proper trace hierarchy using getCurrentRunTree()
4. **Rich Metadata**: Session IDs, client info, and timing for powerful dashboard queries
5. **Workflow Patterns**: Reusable patterns for sequential and parallel operation tracing

This pattern can be applied to any MCP server implementation to achieve the same level of observability, session grouping, and debugging capability.

## Working Configuration Examples

### Complete Project Setup

Here's a full working example that addresses all the project routing issues:

```typescript
// src/config/tracing.ts
import { LangSmithClient } from 'langsmith';
import { traceable } from 'langsmith/traceable';

// Single source of truth for project configuration
function resolveProjectName(): string {
  const sources = [
    process.env.LANGSMITH_PROJECT,
    process.env.LANGCHAIN_PROJECT,
    'mcp-server-default' // Always have a fallback
  ];
  
  for (const source of sources) {
    if (source) {
      console.log(`Using LangSmith project: ${source}`);
      return source;
    }
  }
  
  throw new Error('No LangSmith project could be resolved');
}

// Configuration object
export const tracingConfig = {
  enabled: process.env.LANGSMITH_TRACING === 'true',
  apiKey: process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY,
  projectName: resolveProjectName(),
  endpoint: process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com'
};

// Client initialization
let client: LangSmithClient | null = null;

export function initializeTracing(): void {
  if (!tracingConfig.enabled || !tracingConfig.apiKey) {
    console.log('LangSmith tracing disabled');
    return;
  }
  
  client = new LangSmithClient({
    apiKey: tracingConfig.apiKey,
    projectName: tracingConfig.projectName, // EXPLICIT PROJECT
    apiUrl: tracingConfig.endpoint
  });
  
  // Set environment variables for SDK
  process.env.LANGSMITH_PROJECT = tracingConfig.projectName;
  process.env.LANGSMITH_API_KEY = tracingConfig.apiKey;
  process.env.LANGSMITH_TRACING = 'true';
  
  console.log('✅ LangSmith tracing initialized', {
    project: tracingConfig.projectName,
    endpoint: tracingConfig.endpoint
  });
}

// Tool tracing with consistent project routing
export function traceToolExecution(
  toolName: string, 
  args: any, 
  handler: () => Promise<any>
) {
  if (!tracingConfig.enabled) {
    return handler();
  }
  
  const toolTracer = traceable(
    async () => {
      const startTime = Date.now();
      
      try {
        const result = await handler();
        const executionTime = Date.now() - startTime;
        
        console.log('Tool executed', {
          toolName,
          project: tracingConfig.projectName,
          executionTime
        });
        
        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        console.error('Tool failed', {
          toolName,
          project: tracingConfig.projectName,
          executionTime,
          error: error.message
        });
        
        throw error;
      }
    },
    {
      name: toolName,
      project_name: tracingConfig.projectName, // CONSISTENT PROJECT
      run_type: 'tool'
    }
  );
  
  return toolTracer();
}
```

### Environment File (.env)

```bash
# Required for tracing
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_sk_your_actual_api_key_here
LANGSMITH_PROJECT=kong-mcp-server

# Optional
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LOG_LEVEL=debug
```

### Verification Script

```typescript
// scripts/verify-tracing.ts
import { tracingConfig, initializeTracing, traceToolExecution } from '../src/config/tracing.js';

async function verifyTracing() {
  console.log('🔍 Verifying LangSmith configuration...');
  
  // Check environment
  console.log('Environment variables:', {
    LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
    LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT,
    LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY ? 'Set' : 'Missing'
  });
  
  // Check resolved config
  console.log('Resolved configuration:', {
    enabled: tracingConfig.enabled,
    projectName: tracingConfig.projectName,
    hasApiKey: !!tracingConfig.apiKey,
    endpoint: tracingConfig.endpoint
  });
  
  // Initialize tracing
  initializeTracing();
  
  // Test tool execution
  const result = await traceToolExecution('test_tool', {}, async () => {
    return { success: true, message: 'Test completed' };
  });
  
  console.log('✅ Test tool execution result:', result);
  console.log('🎉 Tracing verification complete!');
}

verifyTracing().catch(console.error);
```

This complete example ensures:
- ✅ Explicit project routing in both client and traceable functions
- ✅ Consistent project names throughout the system
- ✅ Proper environment variable precedence
- ✅ Comprehensive error handling and logging
- ✅ Easy verification and debugging
- ✅ Production-ready configuration patterns