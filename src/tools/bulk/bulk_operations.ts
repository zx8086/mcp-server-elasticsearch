import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { readOnlyManager } from "../../utils/readOnlyMode.js";

export function registerBulkOperationsTool(server, esClient) {
  server.tool(
    "bulk_operations",
    "Perform bulk operations in Elasticsearch",
    {
      operations: z.array(z.record(z.any())),
      index: z.string().optional(),
      routing: z.string().optional(),
      pipeline: z.string().optional(),
      refresh: z.string().optional(),
      requireAlias: z.boolean().optional(),
      timeout: z.string().optional(),
      waitForActiveShards: z.string().optional(),
      flushBytes: z.number().default(5000000),
      concurrency: z.number().default(5),
      retries: z.number().default(3),
    },
    async (params) => {
      // Check read-only mode first
      const readOnlyCheck = readOnlyManager.checkOperation("bulk_operations");
      if (!readOnlyCheck.allowed) {
        return readOnlyManager.createBlockedResponse("bulk_operations");
      }

      // Validation: Ensure index is provided globally or per-document
      const hasGlobalIndex = !!params.index;
      const allDocsHaveIndex = params.operations.every(doc => doc._index);
      if (!hasGlobalIndex && !allDocsHaveIndex) {
        return {
          content: [{
            type: "text",
            text: "Error: You must provide an 'index' parameter or ensure every operation document has a '_index' property."
          }]
        };
      }
      
      try {
        if (readOnlyCheck.warning) {
          logger.warn("🚨 CRITICAL: About to perform bulk operations", { 
            tool: "bulk_operations", 
            operationCount: params.operations.length,
            warning: "This may create, update, or delete multiple documents"
          });
        }
        // Use the helper API for better performance and reliability
        const result = await esClient.helpers.bulk({
          datasource: params.operations,
          onDocument(doc) {
            return { 
              index: { 
                _index: params.index || doc._index,
                routing: params.routing,
                pipeline: params.pipeline,
                refresh: params.refresh,
                require_alias: params.requireAlias,
                timeout: params.timeout,
                wait_for_active_shards: params.waitForActiveShards
              } 
            };
          },
          flushBytes: params.flushBytes,
          concurrency: params.concurrency,
          retries: params.retries,
          onDrop(doc) {
            logger.warn('Document failed after retries:', doc);
          }
        }, {
          opaqueId: 'bulk_operations'
        });
        
        const response = { 
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              total: result.total,
              successful: result.successful,
              failed: result.failed,
              time: result.time,
              bytes: result.bytes
            }, null, 2) 
          }] 
        };
        
        if (readOnlyCheck.warning) {
          return readOnlyManager.createWarningResponse("bulk_operations", response);
        }
        
        return response;
      } catch (error) {
        logger.error("Failed to perform bulk operations:", error);
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 