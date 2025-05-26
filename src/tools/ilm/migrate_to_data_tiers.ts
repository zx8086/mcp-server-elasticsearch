/* src/tools/ilm/migrate_to_data_tiers.ts */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { withReadOnlyCheck, OperationType } from "../../utils/readOnlyMode.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@elastic/elasticsearch";
import type {
  ToolRegistrationFunction,
  SearchResult,
} from "../types.js";

// Define the parameter schema
const MigrateToDataTiersParams = z.object({
  legacyTemplateToDelete: z.string().optional(),
  nodeAttribute: z.string().optional(),
  dryRun: z.boolean().optional(),
  masterTimeout: z.string().optional(),
});

type MigrateToDataTiersParamsType = z.infer<typeof MigrateToDataTiersParams>;

export const registerMigrateToDataTiersTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const migrateToDataTiersImpl = async (
    params: MigrateToDataTiersParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.ilm.migrateToDataTiers({
        legacy_template_to_delete: params.legacyTemplateToDelete,
        node_attribute: params.nodeAttribute,
        dry_run: params.dryRun,
        master_timeout: params.masterTimeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to migrate to data tiers:", {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  };

  server.tool(
    "ilm_migrate_to_data_tiers",
    "Migrate to data tiers routing. Switch the indices, ILM policies, and legacy, composable, and component templates from using custom node attributes and attribute-based allocation filters to using data tiers. ILM must be stopped before performing the migration.",
    {
      legacyTemplateToDelete: z.string().optional(),
      nodeAttribute: z.string().optional(),
      dryRun: z.boolean().optional(),
      masterTimeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "ilm_migrate_to_data_tiers",
      migrateToDataTiersImpl,
      OperationType.DESTRUCTIVE,
    ),
  );
};
