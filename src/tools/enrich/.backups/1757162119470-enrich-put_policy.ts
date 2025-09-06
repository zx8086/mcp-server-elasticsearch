/* src/tools/enrich/put_policy.ts */

import type { Client } from "@elastic/elasticsearch";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../../utils/logger.js";
import { OperationType, withReadOnlyCheck } from "../../utils/readOnlyMode.js";
import type { SearchResult, TextContent, ToolRegistrationFunction } from "../types.js";

// Direct JSON Schema definition
const putPolicySchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      minLength: 1,
      description: "Name of the enrich policy to create",
    },
    geoMatch: {
      type: "object",
      properties: {
        enrichFields: {
          type: "array",
          items: { type: "string" },
          description: "List of fields to be added to documents from the enrich index",
        },
        indices: {
          oneOf: [
            { type: "string" },
            {
              type: "array",
              items: { type: "string" },
            },
          ],
          description: "Source indices for the enrich policy",
        },
        matchField: {
          type: "string",
          description: "Field to match between the input document and the enrich index",
        },
        query: {
          type: "object",
          additionalProperties: true,
          description: "Query to filter documents in the enrich index",
        },
        name: {
          type: "string",
          description: "Optional name for the policy configuration",
        },
        elasticsearchVersion: {
          type: "string",
          description: "Elasticsearch version compatibility",
        },
      },
      required: ["enrichFields", "indices", "matchField"],
      additionalProperties: false,
      description: "Configuration for geo_match enrich policy type",
    },
    match: {
      type: "object",
      properties: {
        enrichFields: {
          type: "array",
          items: { type: "string" },
          description: "List of fields to be added to documents from the enrich index",
        },
        indices: {
          oneOf: [
            { type: "string" },
            {
              type: "array",
              items: { type: "string" },
            },
          ],
          description: "Source indices for the enrich policy",
        },
        matchField: {
          type: "string",
          description: "Field to match between the input document and the enrich index",
        },
        query: {
          type: "object",
          additionalProperties: true,
          description: "Query to filter documents in the enrich index",
        },
        name: {
          type: "string",
          description: "Optional name for the policy configuration",
        },
        elasticsearchVersion: {
          type: "string",
          description: "Elasticsearch version compatibility",
        },
      },
      required: ["enrichFields", "indices", "matchField"],
      additionalProperties: false,
      description: "Configuration for match enrich policy type",
    },
    range: {
      type: "object",
      properties: {
        enrichFields: {
          type: "array",
          items: { type: "string" },
          description: "List of fields to be added to documents from the enrich index",
        },
        indices: {
          oneOf: [
            { type: "string" },
            {
              type: "array",
              items: { type: "string" },
            },
          ],
          description: "Source indices for the enrich policy",
        },
        matchField: {
          type: "string",
          description: "Field to match between the input document and the enrich index",
        },
        query: {
          type: "object",
          additionalProperties: true,
          description: "Query to filter documents in the enrich index",
        },
        name: {
          type: "string",
          description: "Optional name for the policy configuration",
        },
        elasticsearchVersion: {
          type: "string",
          description: "Elasticsearch version compatibility",
        },
      },
      required: ["enrichFields", "indices", "matchField"],
      additionalProperties: false,
      description: "Configuration for range enrich policy type",
    },
    masterTimeout: {
      type: "string",
      description: "Timeout for master node operations. Examples: '30s', '1m'",
    },
  },
  required: ["name"],
  additionalProperties: false,
};

// Zod validator for runtime validation
const enrichSourceValidator = z.object({
  enrichFields: z.array(z.string()),
  indices: z.union([z.string(), z.array(z.string())]),
  matchField: z.string(),
  query: z.object({}).passthrough().optional(),
  name: z.string().optional(),
  elasticsearchVersion: z.string().optional(),
});

const putPolicyValidator = z.object({
  name: z.string().min(1, "Policy name cannot be empty"),
  geoMatch: enrichSourceValidator.optional(),
  match: enrichSourceValidator.optional(),
  range: enrichSourceValidator.optional(),
  masterTimeout: z.string().optional(),
});

type PutPolicyParams = z.infer<typeof putPolicyValidator>;

// MCP error handling
function createPutPolicyMcpError(
  error: Error | string,
  context: {
    type: "validation" | "execution" | "policy_already_exists" | "index_not_found" | "timeout";
    details?: any;
  },
): McpError {
  const message = error instanceof Error ? error.message : error;

  const errorCodeMap = {
    validation: ErrorCode.InvalidParams,
    execution: ErrorCode.InternalError,
    policy_already_exists: ErrorCode.InvalidParams,
    index_not_found: ErrorCode.InvalidParams,
    timeout: ErrorCode.InternalError,
  };

  return new McpError(errorCodeMap[context.type], `[elasticsearch_enrich_put_policy] ${message}`, context.details);
}

// Tool implementation
export const registerEnrichPutPolicyTool: ToolRegistrationFunction = (server: McpServer, esClient: Client) => {
  const putPolicyHandler = async (args: any): Promise<SearchResult> => {
    const perfStart = performance.now();

    try {
      // Validate parameters
      const params = putPolicyValidator.parse(args);
      const { name, geoMatch, match, range, masterTimeout } = params;

      logger.debug("Creating enrich policy", { name, geoMatch, match, range, masterTimeout });

      // Validate that at least one policy type is provided
      if (!geoMatch && !match && !range) {
        throw createPutPolicyMcpError("At least one policy type (geoMatch, match, or range) must be provided", {
          type: "validation",
          details: { providedArgs: args },
        });
      }

      const result = await esClient.enrich.putPolicy({
        name,
        geo_match: geoMatch
          ? {
              enrich_fields: geoMatch.enrichFields,
              indices: geoMatch.indices,
              match_field: geoMatch.matchField,
              query: geoMatch.query,
              name: geoMatch.name,
              elasticsearch_version: geoMatch.elasticsearchVersion,
            }
          : undefined,
        match: match
          ? {
              enrich_fields: match.enrichFields,
              indices: match.indices,
              match_field: match.matchField,
              query: match.query,
              name: match.name,
              elasticsearch_version: match.elasticsearchVersion,
            }
          : undefined,
        range: range
          ? {
              enrich_fields: range.enrichFields,
              indices: range.indices,
              match_field: range.matchField,
              query: range.query,
              name: range.name,
              elasticsearch_version: range.elasticsearchVersion,
            }
          : undefined,
        master_timeout: masterTimeout,
      });

      const duration = performance.now() - perfStart;
      if (duration > 10000) {
        logger.warn("Slow put enrich policy operation", { duration });
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) } as TextContent],
      };
    } catch (error) {
      // Error handling
      if (error instanceof z.ZodError) {
        throw createPutPolicyMcpError(`Validation failed: ${error.errors.map((e) => e.message).join(", ")}`, {
          type: "validation",
          details: { validationErrors: error.errors, providedArgs: args },
        });
      }

      if (error instanceof Error) {
        if (error.message.includes("timeout") || error.message.includes("timed_out")) {
          throw createPutPolicyMcpError(`Operation timed out: ${error.message}`, {
            type: "timeout",
            details: { duration: performance.now() - perfStart },
          });
        }

        if (error.message.includes("already_exists") || error.message.includes("version_conflict")) {
          throw createPutPolicyMcpError(`Enrich policy already exists: ${args?.name || "unknown"}`, {
            type: "policy_already_exists",
            details: { policyName: args?.name },
          });
        }

        if (error.message.includes("index_not_found_exception")) {
          throw createPutPolicyMcpError(`Source index not found for enrich policy: ${error.message}`, {
            type: "index_not_found",
            details: { originalError: error.message },
          });
        }
      }

      throw createPutPolicyMcpError(error instanceof Error ? error.message : String(error), {
        type: "execution",
        details: {
          duration: performance.now() - perfStart,
          args,
        },
      });
    }
  };

  // Implementation function without read-only checks for withReadOnlyCheck wrapper
  const putPolicyImpl = async (params: PutPolicyParams, _extra: Record<string, unknown>): Promise<SearchResult> => {
    return putPolicyHandler(params);
  };

  // Tool registration - WRITE operation with read-only mode protection
  server.tool(
    "elasticsearch_enrich_put_policy",
    "Create an enrich policy in Elasticsearch. Best for data enrichment setup, reference data integration, document enhancement workflows. Use when you need to define policies for adding reference data to documents during ingestion in Elasticsearch.",
    putPolicySchema,
    withReadOnlyCheck("elasticsearch_enrich_put_policy", putPolicyImpl, OperationType.WRITE),
  );
};
