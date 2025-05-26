/* src/tools/enrich/put_policy.ts */

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
const PutPolicyParams = z.object({
  name: z.string().min(1, "Policy name is required"),
  geoMatch: z.object({
    enrichFields: z.array(z.string()),
    indices: z.union([z.string(), z.array(z.string())]),
    matchField: z.string(),
    query: z.record(z.any()).optional(),
    name: z.string().optional(),
    elasticsearchVersion: z.string().optional(),
  }).optional(),
  match: z.object({
    enrichFields: z.array(z.string()),
    indices: z.union([z.string(), z.array(z.string())]),
    matchField: z.string(),
    query: z.record(z.any()).optional(),
    name: z.string().optional(),
    elasticsearchVersion: z.string().optional(),
  }).optional(),
  range: z.object({
    enrichFields: z.array(z.string()),
    indices: z.union([z.string(), z.array(z.string())]),
    matchField: z.string(),
    query: z.record(z.any()).optional(),
    name: z.string().optional(),
    elasticsearchVersion: z.string().optional(),
  }).optional(),
  masterTimeout: z.string().optional(),
});

type PutPolicyParamsType = z.infer<typeof PutPolicyParams>;

export const registerEnrichPutPolicyTool: ToolRegistrationFunction = (
  server: McpServer,
  esClient: Client,
) => {
  // Implementation function without read-only checks
  const putPolicyImpl = async (
    params: PutPolicyParamsType,
    extra: Record<string, unknown>,
  ): Promise<SearchResult> => {
    try {
      const result = await esClient.enrich.putPolicy({
        name: params.name,
        geo_match: params.geoMatch ? {
          enrich_fields: params.geoMatch.enrichFields,
          indices: params.geoMatch.indices,
          match_field: params.geoMatch.matchField,
          query: params.geoMatch.query,
          name: params.geoMatch.name,
          elasticsearch_version: params.geoMatch.elasticsearchVersion,
        } : undefined,
        match: params.match ? {
          enrich_fields: params.match.enrichFields,
          indices: params.match.indices,
          match_field: params.match.matchField,
          query: params.match.query,
          name: params.match.name,
          elasticsearch_version: params.match.elasticsearchVersion,
        } : undefined,
        range: params.range ? {
          enrich_fields: params.range.enrichFields,
          indices: params.range.indices,
          match_field: params.range.matchField,
          query: params.range.query,
          name: params.range.name,
          elasticsearch_version: params.range.elasticsearchVersion,
        } : undefined,
        master_timeout: params.masterTimeout,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      logger.error("Failed to create enrich policy:", {
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
    "enrich_put_policy",
    "Create an enrich policy. Creates an enrich policy.",
    {
      name: z.string().min(1, "Policy name is required"),
      geoMatch: z.object({
        enrichFields: z.array(z.string()),
        indices: z.union([z.string(), z.array(z.string())]),
        matchField: z.string(),
        query: z.record(z.any()).optional(),
        name: z.string().optional(),
        elasticsearchVersion: z.string().optional(),
      }).optional(),
      match: z.object({
        enrichFields: z.array(z.string()),
        indices: z.union([z.string(), z.array(z.string())]),
        matchField: z.string(),
        query: z.record(z.any()).optional(),
        name: z.string().optional(),
        elasticsearchVersion: z.string().optional(),
      }).optional(),
      range: z.object({
        enrichFields: z.array(z.string()),
        indices: z.union([z.string(), z.array(z.string())]),
        matchField: z.string(),
        query: z.record(z.any()).optional(),
        name: z.string().optional(),
        elasticsearchVersion: z.string().optional(),
      }).optional(),
      masterTimeout: z.string().optional(),
    },
    withReadOnlyCheck(
      "enrich_put_policy",
      putPolicyImpl,
      OperationType.WRITE,
    ),
  );
};