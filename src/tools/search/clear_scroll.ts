/* src/tools/search/clear_scroll.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import { ToolRegistrationFunction, SearchResult } from "../types.js";


// Define the parameter schema type
const ClearScrollParams = z.object({

      scrollId: z.string().min(1, "Scroll ID is required"),
    
});

type ClearScrollParamsType = z.infer<typeof ClearScrollParams>;
export const registerClearScrollTool: ToolRegistrationFunction = (
  server: McpServer, 
  esClient: Client
) => {
  server.tool(
    "clear_scroll",
    "Clear a scroll context in Elasticsearch",
    {
      scrollId: z.string().min(1, "Scroll ID is required"),
    },
    async (params: ClearScrollParamsType): Promise<SearchResult> => {
      try {
        const result = await esClient.clearScroll({
          scroll_id: params.scrollId,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logger.error("Failed to clear scroll:", {
          error: error instanceof Error ? error.message : String(error)
        });
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
} 