/**
 * Zod 4 Compatibility Wrapper for MCP SDK
 *
 * The MCP SDK expects to validate arguments using Zod's internal _parse method,
 * which doesn't exist in Zod 4. This wrapper provides compatibility by:
 * 1. Converting Zod schemas to JSON Schema for the SDK
 * 2. Manually validating arguments using Zod's parse method
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { logger } from "./logger.js";
import { zodToJsonSchemaCompat as zodToJsonSchema } from "./zodToJsonSchema.js";

/**
 * Wraps server.tool to handle Zod 4 compatibility
 */
export function registerToolWithZod4<T extends z.ZodTypeAny>(
  server: McpServer,
  name: string,
  description: string,
  schema: T | Record<string, z.ZodTypeAny>,
  handler: (args: z.infer<T>) => Promise<any>,
): void {
  let jsonSchema: any;
  let validator: (args: any) => any;

  // Check if it's a Zod schema object or a plain object with Zod validators
  if (schema && typeof schema === "object" && "_def" in schema) {
    // It's a Zod schema - convert to JSON Schema
    jsonSchema = zodToJsonSchema(schema as z.ZodTypeAny, {
      $refStrategy: "none",
      target: "jsonSchema7",
    });

    // Create validator using Zod's parse method
    validator = (args: any) => (schema as z.ZodTypeAny).parse(args);
  } else if (schema && typeof schema === "object") {
    // It's a plain object with Zod validators - we need to handle this differently
    // The MCP SDK expects this format for Zod 3, but it won't work with Zod 4
    // Convert each field to JSON Schema
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, fieldSchema] of Object.entries(schema as Record<string, z.ZodTypeAny>)) {
      if (fieldSchema && typeof fieldSchema === "object" && "_def" in fieldSchema) {
        // Convert individual field schema
        const fieldJsonSchema = zodToJsonSchema(fieldSchema, {
          $refStrategy: "none",
          target: "jsonSchema7",
        });

        // Remove $schema from nested schemas
        fieldJsonSchema.$schema = undefined;
        properties[key] = fieldJsonSchema;

        // Check if field is optional
        const def = (fieldSchema as any)._def;
        const isOptional =
          def?.typeName === "ZodOptional" ||
          (typeof (fieldSchema as any).isOptional === "function" && (fieldSchema as any).isOptional());

        if (!isOptional) {
          required.push(key);
        }
      }
    }

    jsonSchema = {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    };

    // Create a validator that validates each field
    validator = (args: any) => {
      const result: any = {};
      for (const [key, fieldSchema] of Object.entries(schema as Record<string, z.ZodTypeAny>)) {
        if (key in args) {
          result[key] = fieldSchema.parse(args[key]);
        } else if (!(fieldSchema as any).isOptional?.()) {
          throw new Error(`Missing required field: ${key}`);
        }
      }
      return result;
    };
  } else {
    // Fallback - just pass through
    jsonSchema = schema;
    validator = (args: any) => args;
  }

  // Register the tool with JSON Schema and wrapped handler
  server.tool(name, description, jsonSchema, async (args: any) => {
    try {
      // Validate arguments
      const validatedArgs = validator(args);

      // Call the original handler with validated arguments
      return await handler(validatedArgs);
    } catch (error) {
      // Log validation errors
      logger.error(`Validation failed for tool ${name}:`, {
        error: error instanceof Error ? error.message : String(error),
        args,
      });
      throw error;
    }
  });
}
