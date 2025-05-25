import { z } from "zod";
import { logger } from "../../utils/logger.js";

export function registerBulkOperationsEnhancedTool(server, esClient) {
  server.tool(
    "bulk_operations_enhanced",
    "Perform bulk operations with automatic batching and retry logic",
    {
      operations: z.array(z.record(z.any())),
      index: z.string().optional(),
      flushBytes: z.number().default(5000000),
      concurrency: z.number().default(5),
      retries: z.number().default(3),
    },
    async (params) => {
      try {
        const result = await esClient.helpers.bulk({
          datasource: params.operations,
          onDocument(doc) {
            return { index: { _index: params.index || doc._index } };
          },
          flushBytes: params.flushBytes,
          concurrency: params.concurrency,
          retries: params.retries,
          onDrop(doc) {
            logger.warn('Document failed after retries:', doc);
          }
        });
        
        return { 
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
      } catch (error) {
        logger.error("Enhanced bulk operation failed:", error);
        return { 
          content: [{ 
            type: "text", 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }] 
        };
      }
    }
  );
} 