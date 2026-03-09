/* src/tools/ilm/migrate_to_data_tiers.ts */
/* FIXED: Uses Zod Schema instead of JSON Schema for MCP compatibility */

/* SIMPLIFIED VERSION: Direct JSON Schema + MCP Error Codes */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, ToolRegistrationFunction } from "../types.js";

// =============================================================================
// 1. SIMPLIFIED SCHEMA APPROACH
// =============================================================================

// Direct JSON Schema definition
// FIXED: Original JSON Schema definition removed - now using Zod schema inline

// Simple Zod validator for runtime validation only
const migrateToDataTiersValidator = z.object({
  legacyTemplateToDelete: z.string().optional(),
  nodeAttribute: z.string().optional(),
  dryRun: z.boolean().optional(),
  masterTimeout: z.string().optional(),
});

type _MigrateToDataTiersParams = z.infer<typeof migrateToDataTiersValidator>;

// =============================================================================
// 2. STANDARDIZED MCP ERROR HANDLING
// =============================================================================

function createIlmMigrateToDataTiersMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "permission" | "ilm_running" | "migration_failed";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    permission: ErrorCode.InvalidRequest,
    ilm_running: ErrorCode.InvalidRequest,
    migration_failed: ErrorCode.InternalError,
  };

  return new McpError(
    errorCodeMap[context.type],
    `[elasticsearch_ilm_migrate_to_data_tiers] ${message}`,
    context.details,
  );
}

// =============================================================================
// 3. SIMPLIFIED TOOL IMPLEMENTATION
// =============================================================================

export const registerMigrateToDataTiersTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const migrateToDataTiersHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Simple validation - no complex parameter extraction
      const params = migrateToDataTiersValidator.parse(args);

      logger.debug("Migrating to data tiers", {
        legacyTemplateToDelete: params.legacyTemplateToDelete,
        nodeAttribute: params.nodeAttribute,
        dryRun: params.dryRun,
        masterTimeout: params.masterTimeout,
      });

      const result = await esClient.ilm.migrateToDataTiers({
        legacy_template_to_delete: params.legacyTemplateToDelete,
        node_attribute: params.nodeAttribute,
        dry_run: params.dryRun,
        master_timeout: params.masterTimeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 10000) {
        logger.warn("Slow ILM operation: migrate_to_data_tiers", { duration });
      }

      logger.info("Data tiers migration completed", { dryRun: params.dryRun });

      // Enhanced response with migration summary
      const isDryRun = params.dryRun === true;
      const migrationSummary = {
        dry_run: isDryRun,
        removed_legacy_template: result.removed_legacy_template || false,
        migrated_ilm_policies: result.migrated_ilm_policies || [],
        migrated_indices: result.migrated_indices || [],
        migrated_legacy_templates: result.migrated_legacy_templates || [],
        timestamp: new Date().toISOString(),
      };

      // MCP-compliant success response
      return {
        content: [
          {
            type: "text",
            text: `**Data Tiers Migration ${isDryRun ? "Preview" : "Completed"}**

${isDryRun ? "**DRY RUN**: No actual changes were made" : "**APPLIED**: Changes have been applied to the cluster"}

**Migration Summary:**
- **Policies Migrated**: ${(result.migrated_ilm_policies || []).length}
- **Indices Migrated**: ${(result.migrated_indices || []).length}
- **Templates Migrated**: ${(result.migrated_legacy_templates || []).length}
- **Legacy Template Removed**: ${result.removed_legacy_template ? "Yes" : "No"}

${isDryRun ? "**Next Step**: Run without dryRun to apply changes" : "**Complete**: Your cluster now uses data tiers routing"}

Operation completed at: ${new Date().toISOString()}`,
          },
          {
            type: "text",
            text: JSON.stringify(migrationSummary, null, 2),
          },
        ],
      };
    } catch (error) {
      // Standardized MCP error handling
      if (error instanceof z.ZodError) {
        throw createIlmMigrateToDataTiersMcpError(
          `Validation failed: ${error.issues.map((e) => e.message).join(", ")}`,
          {
            type: "validation",
            details: { validationErrors: error.issues, providedArgs: args },
          },
        );
      }

      if (error instanceof Error) {
        if (error.message.includes("security_exception")) {
          throw createIlmMigrateToDataTiersMcpError("Insufficient permissions to migrate to data tiers", {
            type: "permission",
            details: { originalError: error.message },
          });
        }

        if (error.message.includes("ilm_running") || error.message.includes("ILM is running")) {
          throw createIlmMigrateToDataTiersMcpError("ILM must be stopped before migration", {
            type: "ilm_running",
            details: { suggestion: "Use elasticsearch_ilm_stop to stop ILM first" },
          });
        }

        if (error.message.includes("migration_exception") || error.message.includes("migration_failed")) {
          throw createIlmMigrateToDataTiersMcpError(`Migration failed: ${error.message}`, {
            type: "migration_failed",
            details: { suggestion: "Try with dryRun:true first to check for issues" },
          });
        }
      }

      throw createIlmMigrateToDataTiersMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Direct tool registration with JSON Schema + read-only protection
  // Tool registration using modern registerTool method

  server.registerTool(
    "elasticsearch_ilm_migrate_to_data_tiers",

    {
      title: "Ilm Migrate To Data Tiers",

      description:
        "Migrate to data tiers. Migrate from custom node attributes to data tiers routing in Elasticsearch ILM. Uses direct JSON Schema and standardized MCP error codes. Requires ILM to be stopped first. Examples: {dryRun: true}, {nodeAttribute: box_type, legacyTemplateToDelete: old-template}",

      inputSchema: {
        legacyTemplateToDelete: z.string().optional(), // Name of legacy template to delete during migration
        nodeAttribute: z.string().optional(), // Node attribute to migrate from (e.g., 'box_type')
        dryRun: z.boolean().optional(), // Perform a dry run without making changes
        masterTimeout: z.string().optional(), // Master node timeout
      },
    },

    // Direct JSON Schema - no Zod conversion
    withReadOnlyCheck("elasticsearch_ilm_migrate_to_data_tiers", migrateToDataTiersHandler, OperationType.DESTRUCTIVE),
  );
};
