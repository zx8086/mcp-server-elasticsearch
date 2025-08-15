# LangSmith Tracing Implementation Guide

## Complete Implementation Reference for Distributed Tracing

This guide provides a comprehensive, production-ready implementation of LangSmith tracing for RAG (Retrieval-Augmented Generation) applications with tool execution capabilities. All code examples and configurations are from a working production implementation.

## Table of Contents
1. [Prerequisites & Dependencies](#prerequisites--dependencies)
2. [Environment Configuration](#environment-configuration)
3. [Core Architecture Pattern](#core-architecture-pattern)
4. [Step-by-Step Implementation](#step-by-step-implementation)
5. [API Route Integration](#api-route-integration)
6. [Service Layer Integration](#service-layer-integration)
7. [Tool Execution Tracing](#tool-execution-tracing)
8. [Trace Header Propagation](#trace-header-propagation)
9. [User Feedback Integration](#user-feedback-integration)
10. [Testing & Verification](#testing--verification)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)
13. [Production Considerations](#production-considerations)

## Prerequisites & Dependencies

### Required Packages

Add these dependencies to your `package.json`:

```json
{
  "dependencies": {
    "langsmith": "^0.3.49",
    "langchain": "^0.3.15",
    "@langchain/core": "^0.3.65",
    "@langchain/community": "^0.3.49",
    "@langchain/openai": "^0.6.3"
  }
}
```

### Installation

Using Bun (recommended):
```bash
bun add langsmith langchain @langchain/core
```

Using npm:
```bash
npm install langsmith langchain @langchain/core
```

## Environment Configuration

### Required Environment Variables

Add these to your `.env` file:

```bash
# LangSmith Configuration (Required)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT='https://api.smith.langchain.com'
LANGSMITH_API_KEY='your-langsmith-api-key'
LANGSMITH_PROJECT='your-project-name'

# Alternative naming (also supported)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT='https://api.smith.langchain.com'
LANGCHAIN_API_KEY='your-langsmith-api-key'
LANGCHAIN_PROJECT='your-project-name'
```

### Runtime Access

For Bun runtime:
```typescript
const apiKey = Bun.env.LANGSMITH_API_KEY || Bun.env.LANGCHAIN_API_KEY;
```

For Node.js:
```typescript
const apiKey = process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY;
```

## Core Architecture Pattern

### Single Conversation Trace with Nested Operations

The key to proper tracing is maintaining a single parent trace for each conversation with all operations nested as children:

```
📊 Chat Conversation (main trace)
├── 🔍 Knowledge Base Retrieval (child)
├── ⚙️ Context Processing (child)
├── 🤖 LLM Completion (child)
├── 🔧 Tool: get_system_vitals (child)
└── 🔧 Tool: get_most_expensive_queries (child)
```

### Key Principles

1. **One Parent Trace**: Create a single top-level trace per conversation turn
2. **Proper Run Types**: Use semantic run_type values for each operation
3. **Automatic Context Inheritance**: Child operations automatically inherit parent context
4. **Metadata Consistency**: Pass session/thread IDs for conversation continuity

## Step-by-Step Implementation

### Step 1: Import Required Modules

```typescript
import { traceable } from "langsmith/traceable";
import { getCurrentRunTree, withRunTree } from "langsmith/singletons/traceable";
import { RunTree } from "langsmith/run_trees";
import { Client } from "langsmith";
```

### Step 2: Create Main Conversation Trace

This is the parent trace that all other operations will nest under:

```typescript
// src/routes/api/chat/+server.ts

import { traceable } from "langsmith/traceable";

// Create traceable conversation handler
const processConversation = traceable(
  async (
    currentMessage: string, 
    conversationMessages: any[], 
    metadata: RAGMetadata, 
    ragProvider: any,
    signal?: AbortSignal
  ) => {
    // Log trace context for debugging
    const { getCurrentRunTree } = await import("langsmith/traceable");
    const currentRun = getCurrentRunTree();
    
    console.log("🔍 Current run tree:", {
      runId: currentRun?.id,
      runName: currentRun?.name,
      runType: currentRun?.run_type,
      hasParent: !!currentRun?.parent_run_id,
      parentId: currentRun?.parent_run_id,
    });

    // Execute RAG query within conversation trace context
    const { stream, context } = await ragProvider.query(
      currentMessage, 
      metadata, 
      conversationMessages
    );

    // Return the run ID along with results for client-side tracking
    return { stream, context, runId: currentRun?.id };
  },
  {
    run_type: "chain",
    name: "Chat Conversation",
  }
);
```

### Step 3: Add Metadata for Thread Continuity

Metadata must be passed as the final parameter according to LangSmith documentation:

```typescript
// Generate thread/conversation identifiers
const conversationId = user?.conversationId || `conv-${user?.id || 'anon'}-${Date.now()}`;
const sessionId = user?.sessionId || `session-${user?.id || 'anon'}-${Date.now()}`;

// Prepare metadata structure
const metadata: RAGMetadata = {
  // User Information
  userId: user?.id || "anonymous",
  userName: user?.name || "anonymous",
  userEmail: user?.email || "anonymous",
  
  // Session Information
  sessionId: sessionId,
  conversationId: conversationId,
  messageCount: user?.messageCount || 1,
  
  // Request Details
  serverTimestamp: new Date().toISOString(),
  messageLength: currentMessage.length,
  conversationLength: conversationMessages.length,
};

// Execute with proper metadata placement (as final parameter)
const { stream, context, runId } = await processConversation(
  currentMessage, 
  conversationMessages, 
  metadata,
  ragProvider,
  request.signal,
  {
    metadata: {
      session_id: sessionId,
      thread_id: conversationId,
      conversation_id: conversationId,
      user_id: user?.id || 'anonymous',
      message_count: metadata.messageCount,
    },
    tags: [
      "conversation",
      "chat-session",
      `user:${user?.id || 'anonymous'}`,
      `conversation:${conversationId}`,
    ],
  }
);
```

## API Route Integration

### Complete API Route Example

```typescript
// src/routes/api/chat/+server.ts

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { traceable } from "langsmith/traceable";
import { createRAGProvider } from "$lib/rag/factory";

// Initialize provider lazily
let ragProvider: any = null;

// Create traceable conversation handler
const processConversation = traceable(
  async (currentMessage: string, conversationMessages: any[], metadata: any, ragProvider: any) => {
    const { stream, context } = await ragProvider.query(currentMessage, metadata, conversationMessages);
    return { stream, context };
  },
  {
    run_type: "chain",
    name: "Chat Conversation",
  }
);

export const POST: RequestHandler = async ({ fetch, request }) => {
  try {
    // Initialize provider if needed
    if (!ragProvider) {
      ragProvider = createRAGProvider(fetch);
      await ragProvider.initialize();
    }

    const { message, messages, user } = await request.json();
    
    // Prepare conversation context
    const conversationMessages = messages || [{ role: 'user', content: message }];
    const currentMessage = conversationMessages[conversationMessages.length - 1]?.content || message;
    
    // Generate identifiers for thread continuity
    const conversationId = user?.conversationId || `conv-${Date.now()}`;
    const sessionId = user?.sessionId || `session-${Date.now()}`;
    
    // Execute within trace context with proper metadata
    const { stream, context, runId } = await processConversation(
      currentMessage, 
      conversationMessages, 
      { userId: user?.id, conversationId, sessionId },
      ragProvider,
      {
        metadata: {
          session_id: sessionId,
          thread_id: conversationId,
          user_id: user?.id || 'anonymous',
        },
        tags: ["conversation", `user:${user?.id || 'anonymous'}`],
      }
    );

    // Stream response back to client
    return new Response(
      new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ content: chunk }) + "\n"));
          }
          // Send completion with runId for feedback
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ done: true, runId }) + "\n"));
          controller.close();
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      }
    );
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};
```

## Service Layer Integration

### Creating Child Operations

Each major step in your RAG pipeline should be wrapped as a traceable child operation:

```typescript
// src/lib/rag/providers/aws-knowledge-base.ts

export class AWSKnowledgeBaseRAGProvider implements RAGProvider {
  private ragPipeline: any;

  async initialize() {
    // Create traceable child operations
    const tracedKnowledgeBaseRetrieval = traceable(
      this.knowledgeBaseRetrieval,
      {
        name: "Knowledge Base Retrieval",
        run_type: "retriever",
      }
    );

    const tracedContextProcessing = traceable(
      this.contextProcessing,
      {
        name: "Context Processing", 
        run_type: "chain",
      }
    );

    const tracedLLMCompletion = traceable(
      this.llmCompletion,
      {
        name: "LLM Completion",
        run_type: "llm",
      }
    );

    // Compose pipeline
    this.ragPipeline = async (message: string, messages?: ConversationMessage[]) => {
      // These will automatically nest under the parent conversation trace
      const { response } = await tracedKnowledgeBaseRetrieval(message);
      const { context } = await tracedContextProcessing(response);
      const { stream } = await tracedLLMCompletion(message, context, messages);
      
      return { stream, context };
    };
  }

  private knowledgeBaseRetrieval = async (message: string) => {
    // Implementation
    const response = await this.client.send(new RetrieveCommand({
      knowledgeBaseId: this.knowledgeBaseId,
      retrievalQuery: { text: message },
    }));
    return { response };
  };

  private contextProcessing = async (response: any) => {
    // Process and deduplicate context
    const context = response.retrievalResults?.map(result => ({
      text: result.content?.text || "",
      metadata: { score: result.score },
    }));
    return { context };
  };

  private llmCompletion = async (message: string, context: any[], messages?: any[]) => {
    // Get trace headers for cross-service propagation
    const currentRunTree = getCurrentRunTree(true);
    let traceHeaders: Record<string, string> | undefined;
    
    if (currentRunTree) {
      traceHeaders = currentRunTree.toHeaders();
    }

    // Pass trace headers to chat service
    const stream = await this.chatService.createChatCompletion(
      messages,
      { traceHeaders }
    );
    
    return { stream };
  };
}
```

## Tool Execution Tracing

### Implementing Tool Functions with Proper Tracing

```typescript
// src/lib/services/bedrock-chat.ts

import { traceable } from "langsmith/traceable";
import { getCurrentRunTree, withRunTree } from "langsmith/singletons/traceable";
import { RunTree } from "langsmith/run_trees";

export class BedrockChatService {
  private async executeTool(
    name: string,
    input: any,
    currentRunTree?: any
  ): Promise<ToolExecutionResult> {
    // If no parent trace provided, try to get current context
    if (!currentRunTree) {
      try {
        currentRunTree = getCurrentRunTree(true);
      } catch (error) {
        currentRunTree = undefined;
      }
    }

    // Create traceable tool function
    const executeSpecificTool = traceable(
      async (toolName: string, toolInput: any) => {
        console.log("🔧 Executing tool:", { toolName, inputKeys: Object.keys(toolInput) });
        
        // Tool execution logic
        let result: ToolExecutionResult;
        
        switch (toolName) {
          case "get_system_vitals":
            result = await this.executeGetSystemVitals(toolInput.node_filter);
            break;
          case "get_most_expensive_queries":
            result = await this.executeGetMostExpensiveQueries(toolInput.limit);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
        
        return result;
      },
      {
        name: `Tool: ${name}`,
        run_type: "tool",
      }
    );

    // Execute within parent trace context if available
    if (currentRunTree) {
      return await withRunTree(currentRunTree, async () => {
        return await executeSpecificTool(name, input);
      });
    } else {
      return await executeSpecificTool(name, input);
    }
  }

  private async executeGetSystemVitals(nodeFilter?: string): Promise<ToolExecutionResult> {
    try {
      const query = systemVitalsQuery(nodeFilter);
      const result = await clusterConn.query(query);
      
      return {
        success: true,
        content: JSON.stringify(result.rows, null, 2),
        data: {
          rows: result.rows,
          count: result.rows.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        content: "Failed to retrieve system vitals",
        error: error.message,
      };
    }
  }
}
```

## Trace Header Propagation

### Cross-Service Boundary Tracing

When your RAG provider needs to call another service (like a chat completion service), propagate trace headers:

```typescript
// In RAG Provider (sender)
private llmCompletion = async (message: string, context: any[], messages?: any[]) => {
  // Get current run tree and convert to headers
  const currentRunTree = getCurrentRunTree(true);
  let traceHeaders: Record<string, string> | undefined;
  
  if (currentRunTree) {
    traceHeaders = currentRunTree.toHeaders();
    console.log("🔗 Passing trace context to chat service", {
      traceId: currentRunTree.id,
      parentId: currentRunTree.parent_run_id,
      headerKeys: Object.keys(traceHeaders),
    });
  }

  // Pass headers to downstream service
  const stream = await this.chatService.createChatCompletion(
    messages,
    { 
      traceHeaders,
      temperature: 0.7,
      max_tokens: 8000,
    }
  );
  
  return { stream };
};

// In Chat Service (receiver)
async createChatCompletion(
  messages: Array<{ role: string; content: string }>,
  options: {
    traceHeaders?: Record<string, string>;
    temperature?: number;
    max_tokens?: number;
  } = {}
) {
  let parentRunTree: any;
  
  // Recreate RunTree from headers
  if (options.traceHeaders) {
    try {
      parentRunTree = await RunTree.fromHeaders(options.traceHeaders);
      console.log("🔗 Successfully created RunTree from headers", {
        traceId: parentRunTree?.id,
        parentId: parentRunTree?.parent_run_id,
      });
    } catch (error) {
      console.warn("⚠️ Failed to create RunTree from headers", { error: error.message });
    }
  }
  
  // Continue with chat completion...
}
```

### Trace Header Format

LangSmith automatically generates trace headers in this format:

```typescript
{
  "langsmith-trace": "20250724T085439396001Zae05ae4c-c768-4072-b2e2-6ab3b21e5d2e.20250724T085439875004Zec1978e4-f4c2-4140-be01-37bf4e26e55d",
  "baggage": "langsmith-project=your-project-name"
}
```

## User Feedback Integration

### Implementing Feedback Submission

Allow users to provide feedback on AI responses:

```typescript
// src/routes/api/feedback/+server.ts

import { json } from "@sveltejs/kit";
import { Client } from "langsmith";

// Initialize Langsmith client
const langsmithClient = new Client({
  apiKey: Bun.env.LANGSMITH_API_KEY,
  apiUrl: Bun.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com",
});

export const POST = async ({ request }) => {
  try {
    const { runId, score, comment, userId, userName } = await request.json();

    // Validate inputs
    if (!runId) {
      return json({ error: "Run ID is required" }, { status: 400 });
    }

    if (score !== -1 && score !== 0 && score !== 1) {
      return json({ error: "Score must be -1, 0, or 1" }, { status: 400 });
    }

    // Submit feedback to Langsmith
    await langsmithClient.createFeedback(runId, "user_rating", {
      score: score,
      comment: comment,
      sourceInfo: {
        userId: userId || "anonymous",
        userName: userName || "anonymous",
        timestamp: new Date().toISOString(),
        source: "chat_interface",
      },
    });

    return json({ success: true });
  } catch (error) {
    return json({ error: "Failed to submit feedback" }, { status: 500 });
  }
};
```

### Client-Side Integration

```typescript
// In your frontend component
async function submitFeedback(score: number, comment?: string) {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      runId: currentRunId, // Received from the chat response
      score: score, // -1 (thumbs down), 0 (neutral), 1 (thumbs up)
      comment: comment,
      userId: user?.id,
      userName: user?.name,
    }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to submit feedback');
  }
}
```

## Testing & Verification

### Simple Test Endpoint

Create a test endpoint to verify tracing is working:

```typescript
// src/routes/api/test-tracing/+server.ts

import { json } from '@sveltejs/kit';
import { traceable } from 'langsmith/traceable';

const processMessage = traceable(
  async (message: string) => {
    console.log(`🔄 Processing message: ${message}`);
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      original: message,
      processed: `Processed: ${message}`,
      timestamp: new Date().toISOString(),
    };
  },
  { 
    name: "Test Message Processor",
    tags: ["api", "test"],
  }
);

export async function GET({ url }) {
  const message = url.searchParams.get('message') || 'Test message';
  const result = await processMessage(message);
  
  return json({
    success: true,
    data: result,
    tracing: "LangSmith trace executed successfully"
  });
}
```

### Testing the Implementation

1. **Test Basic Tracing**:
   ```bash
   curl http://localhost:5173/api/test-tracing?message=Hello
   ```

2. **Check LangSmith Dashboard**:
   - Go to https://smith.langchain.com
   - Navigate to your project
   - Verify traces appear with proper nesting

3. **Verify Conversation Threading**:
   - Send multiple messages in the same conversation
   - Check that they appear in the same thread in LangSmith

## Best Practices

### Do's ✅

1. **Single Top-Level Trace**: One main traceable wrapper per conversation turn
2. **Proper run_type Values**:
   - `"chain"` for orchestration/workflow
   - `"retriever"` for document retrieval
   - `"llm"` for language model calls
   - `"tool"` for function/tool execution
3. **Consistent Metadata**: Use session_id, thread_id for conversation continuity
4. **Error Handling**: Preserve trace context even during errors
5. **Debugging**: Use `getCurrentRunTree()` to verify trace context

### Don'ts ❌

1. **Multiple Top-Level Traces**: Avoid creating sibling traces for one conversation
2. **Nested withRunTree**: Don't double-wrap with traceable() and withRunTree()
3. **Missing Metadata**: Always include user and session information
4. **Blocking Operations**: Don't perform heavy computation in traceable functions
5. **Sensitive Data**: Never log passwords, API keys, or PII in traces

## Troubleshooting

### Issue: Separate Traces Instead of Nested

**Symptom**: Multiple top-level traces appear for a single conversation

**Solution**:
```typescript
// ❌ Wrong - Multiple top-level traces
const retrieval = traceable(async () => {...}, { name: "Retrieval" });
const processing = traceable(async () => {...}, { name: "Processing" });

// ✅ Correct - Single parent with children
const conversation = traceable(async () => {
  await retrieval(); // Will nest under conversation
  await processing(); // Will nest under conversation
}, { name: "Conversation" });
```

### Issue: Lost Trace Context

**Symptom**: Child operations don't appear under parent

**Solution**:
```typescript
// Ensure trace context is preserved
const currentRun = getCurrentRunTree();
if (currentRun) {
  await withRunTree(currentRun, async () => {
    await childOperation();
  });
}
```

### Issue: Metadata Not Visible

**Symptom**: Session/user info not appearing in LangSmith

**Solution**:
```typescript
// Metadata must be passed as final parameter
await traceableFunction(arg1, arg2, {
  metadata: { user_id: "123", session_id: "abc" },
  tags: ["production", "user:123"],
});
```

### Issue: Tools Not Appearing as Children

**Symptom**: Tool executions show as separate traces

**Solution**:
```typescript
// Use withRunTree for tool execution
const currentRunTree = getCurrentRunTree();
if (currentRunTree) {
  return await withRunTree(currentRunTree, async () => {
    return await executeToolWithTracing(toolName, toolInput);
  });
}
```

## Production Considerations

### Performance Optimization

1. **Batch Operations**: Group multiple operations to reduce trace overhead
2. **Async Processing**: Use async/await properly to avoid blocking
3. **Selective Tracing**: Only trace important operations in production
4. **Sampling**: Consider sampling traces for high-volume endpoints

### Monitoring & Alerts

```typescript
// Add custom metadata for monitoring
const processConversation = traceable(
  async (...args) => {
    const startTime = Date.now();
    try {
      const result = await operation();
      return result;
    } catch (error) {
      // Log error to trace
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 5000) {
        console.warn(`Slow operation: ${duration}ms`);
      }
    }
  },
  {
    name: "Conversation",
    metadata: {
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION,
    },
  }
);
```

### Cost Management

1. **Token Tracking**: Monitor token usage in traces
2. **Rate Limiting**: Implement rate limiting for API endpoints
3. **Trace Retention**: Configure appropriate retention policies in LangSmith
4. **Selective Feedback**: Only collect feedback for important interactions

### Security Considerations

1. **API Key Management**: Use environment variables, never hardcode
2. **Data Sanitization**: Remove sensitive data before tracing
3. **Access Control**: Restrict LangSmith project access appropriately
4. **Compliance**: Ensure tracing complies with data regulations

## Example: Complete RAG Implementation

Here's a complete example bringing all components together:

```typescript
// src/lib/rag/rag-service.ts

import { traceable } from "langsmith/traceable";
import { getCurrentRunTree, withRunTree } from "langsmith/singletons/traceable";

export class RAGService {
  async processQuery(
    query: string, 
    userId: string,
    sessionId: string
  ) {
    // Main conversation trace
    const processConversation = traceable(
      async () => {
        // Child operation 1: Retrieve documents
        const documents = await this.retrieveDocuments(query);
        
        // Child operation 2: Process context
        const context = await this.processContext(documents);
        
        // Child operation 3: Generate response
        const response = await this.generateResponse(query, context);
        
        // Child operation 4: Execute tools if needed
        if (response.requiresTools) {
          const toolResults = await this.executeTools(response.tools);
          response.toolResults = toolResults;
        }
        
        return response;
      },
      {
        name: "RAG Query Processing",
        run_type: "chain",
      }
    );

    // Execute with metadata
    return await processConversation({
      metadata: {
        user_id: userId,
        session_id: sessionId,
        query_length: query.length,
        timestamp: new Date().toISOString(),
      },
      tags: ["rag", `user:${userId}`, "production"],
    });
  }

  private retrieveDocuments = traceable(
    async (query: string) => {
      // Document retrieval logic
      return documents;
    },
    { name: "Document Retrieval", run_type: "retriever" }
  );

  private processContext = traceable(
    async (documents: any[]) => {
      // Context processing logic
      return context;
    },
    { name: "Context Processing", run_type: "chain" }
  );

  private generateResponse = traceable(
    async (query: string, context: any) => {
      // LLM generation logic
      return response;
    },
    { name: "Response Generation", run_type: "llm" }
  );

  private executeTools = traceable(
    async (tools: string[]) => {
      const currentRun = getCurrentRunTree();
      const results = [];
      
      for (const tool of tools) {
        if (currentRun) {
          const result = await withRunTree(currentRun, async () => {
            return await this.executeSingleTool(tool);
          });
          results.push(result);
        }
      }
      
      return results;
    },
    { name: "Tool Execution", run_type: "chain" }
  );

  private executeSingleTool = traceable(
    async (toolName: string) => {
      // Individual tool execution
      return toolResult;
    },
    { name: "Execute Tool", run_type: "tool" }
  );
}
```

## Conclusion

This implementation provides:
- ✅ Single conversation traces with proper nesting
- ✅ Thread continuity across multiple messages
- ✅ Tool execution tracking
- ✅ Cross-service trace propagation
- ✅ User feedback integration
- ✅ Production-ready error handling
- ✅ Performance monitoring capabilities

Follow this guide to implement robust distributed tracing in your RAG applications with LangSmith, ensuring complete observability of your AI pipelines.

## Additional Resources

- [LangSmith Documentation](https://docs.smith.langchain.com)
- [LangSmith API Reference](https://api.smith.langchain.com/docs)
- [Traceable Function Guide](https://docs.smith.langchain.com/tracing/concepts#traceable-function)
- [RunTree API](https://docs.smith.langchain.com/tracing/concepts#runtree)