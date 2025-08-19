import { z } from "zod";
import { zodToJsonSchema as zodToJsonSchemaV3 } from "zod-to-json-schema";

/**
 * Simplify a field schema to its base type for JSON Schema
 */
function simplifyFieldSchema(field: z.ZodTypeAny): any {
  const def = (field as any)._def;

  // Handle unions (like coerceBoolean, coerceNumber)
  if (def && (def.typeName === "ZodUnion" || def.type === "union")) {
    const targetType = detectCoercionTargetType(field);

    // Check for default values
    const defaultValue = extractDefaultValue(field);
    const result: any = { type: targetType };

    if (defaultValue !== undefined) {
      result.default = defaultValue;
    }

    // Check for description
    if (def.description) {
      result.description = def.description;
    }

    return result;
  }

  // Handle enums
  if (def && (def.typeName === "ZodEnum" || def.type === "enum")) {
    const result: any = {
      type: "string",
      enum: def.values || def.options,
    };

    if (def.description) {
      result.description = def.description;
    }

    return result;
  }

  // Handle strings
  if (def && (def.typeName === "ZodString" || def.type === "string")) {
    const result: any = { type: "string" };

    if (def.checks) {
      for (const check of def.checks) {
        if (check.kind === "min") result.minLength = check.value;
        if (check.kind === "max") result.maxLength = check.value;
      }
    }

    if (def.description) {
      result.description = def.description;
    }

    return result;
  }

  // Handle numbers
  if (def && (def.typeName === "ZodNumber" || def.type === "number")) {
    const result: any = { type: "number" };

    if (def.checks) {
      for (const check of def.checks) {
        if (check.kind === "min") result.minimum = check.value;
        if (check.kind === "max") result.maximum = check.value;
      }
    }

    if (def.description) {
      result.description = def.description;
    }

    return result;
  }

  // Handle booleans
  if (def && (def.typeName === "ZodBoolean" || def.type === "boolean")) {
    const result: any = { type: "boolean" };

    if (def.description) {
      result.description = def.description;
    }

    return result;
  }

  // Handle defaults
  if (def && (def.typeName === "ZodDefault" || def.type === "default")) {
    const inner = simplifyFieldSchema(def.innerType || def.schema);
    if (def.defaultValue) {
      inner.default = typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
    }
    return inner;
  }

  // Handle optionals
  if (def && (def.typeName === "ZodOptional" || def.type === "optional")) {
    return simplifyFieldSchema(def.innerType || def.schema);
  }

  // Handle z.record()
  if (def && (def.typeName === "ZodRecord" || def.type === "record")) {
    return {
      type: "object",
      additionalProperties: true,
    };
  }

  // Handle z.object({}).passthrough()
  if (def && (def.typeName === "ZodObject" || def.type === "object")) {
    const result: any = { type: "object" };

    if (def.unknownKeys === "passthrough") {
      result.additionalProperties = true;
    }

    // For empty objects with passthrough
    const shape = def.shape ? (typeof def.shape === "function" ? def.shape() : def.shape) : {};
    if (Object.keys(shape).length === 0 && def.unknownKeys === "passthrough") {
      result.properties = {};
    }

    return result;
  }

  // Handle z.unknown()
  if (def && (def.typeName === "ZodUnknown" || def.type === "unknown")) {
    return {}; // JSON Schema for "any" type
  }

  // Handle z.custom()
  if (def && (def.typeName === "ZodCustom" || def.type === "custom")) {
    // Custom types can't be represented, but we can allow any type
    return {}; // JSON Schema for "any" type
  }

  // Default fallback
  return { type: "string" };
}

/**
 * Extract default value from a schema
 */
function extractDefaultValue(schema: z.ZodTypeAny): any {
  const def = (schema as any)._def;

  if (def && def.defaultValue) {
    return typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
  }

  // Check in nested schemas
  if (def && def.innerType) {
    return extractDefaultValue(def.innerType);
  }

  return undefined;
}

/**
 * Detect the target type for coercion schemas
 */
function detectCoercionTargetType(schema: z.ZodTypeAny): string {
  const def = (schema as any)._def;

  // Check union options for the target type
  if (def && def.options) {
    for (const option of def.options) {
      const optionDef = (option as any)._def;
      if (optionDef) {
        if (optionDef.typeName === "ZodBoolean") return "boolean";
        if (optionDef.typeName === "ZodNumber") return "number";
        if (optionDef.typeName === "ZodString" && !optionDef.checks?.some((c: any) => c.kind === "transform")) {
          return "string";
        }
      }
    }
  }

  // Default fallback
  return "string";
}

/**
 * Compatibility wrapper for Zod to JSON Schema conversion
 * Works with both Zod 3.x (via zod-to-json-schema) and Zod 4.x (via native toJSONSchema)
 */
export function zodToJsonSchemaCompat(schema: z.ZodTypeAny, options: any = {}): any {
  // Handle special cases that Zod 4's native toJSONSchema doesn't support
  const def = (schema as any)._def;

  // Handle z.record() ONLY if it's the root schema, not a field within an object
  // In Zod 4, records have def.type === "record"
  if (def && (def.typeName === "ZodRecord" || def.type === "record")) {
    // Check if this is the root schema being converted
    // If it's nested, let the normal conversion handle it
    return {
      type: "object",
      additionalProperties: true,
      $schema: "http://json-schema.org/draft-07/schema#",
    };
  }

  // Check if Zod 4 has native toJSONSchema
  if (typeof (z as any).toJSONSchema === "function") {
    // Zod 4.x with native JSON Schema support

    // Try to convert, but handle transforms and custom types which aren't supported
    let jsonSchema;
    try {
      jsonSchema = (z as any).toJSONSchema(schema);
    } catch (error: any) {
      // If it's a transform or custom type error, create a simplified schema
      if (
        error.message &&
        (error.message.includes("Transforms cannot be represented") ||
          error.message.includes("Custom types cannot be represented"))
      ) {
        // Handle transforms by creating a simplified schema
        const def = (schema as any)._def;

        // Check if it's an object with transform fields
        if (def && (def.typeName === "ZodObject" || def.type === "object")) {
          // Manually build the object schema
          const properties: any = {};
          const required: string[] = [];

          const shape = def.shape ? (typeof def.shape === "function" ? def.shape() : def.shape) : {};

          for (const [key, field] of Object.entries(shape)) {
            // Simplify each field to its base type
            properties[key] = simplifyFieldSchema(field as z.ZodTypeAny);

            // Check if field is required
            if (!(field as any).isOptional || !(field as any).isOptional()) {
              required.push(key);
            }
          }

          const result: any = {
            type: "object",
            properties,
            $schema: "http://json-schema.org/draft-07/schema#",
          };

          if (required.length > 0) {
            result.required = required;
          }

          if (def.unknownKeys === "passthrough") {
            result.additionalProperties = true;
          } else {
            result.additionalProperties = false;
          }

          return result;
        }

        // Check if it's a union with transforms (like coerceBoolean)
        if (def && def.typeName === "ZodUnion") {
          // For coercion unions, just use the target type
          // coerceBoolean -> boolean, coerceNumber -> number
          return {
            type: detectCoercionTargetType(schema),
            $schema: "http://json-schema.org/draft-07/schema#",
          };
        }

        // For other transforms, try to extract the base type
        if (def && def.typeName === "ZodEffects") {
          // Recursively try to convert the inner type
          return zodToJsonSchemaCompat((schema as any)._def.schema, options);
        }

        // Check if it's a custom type
        if (def && (def.typeName === "ZodCustom" || def.type === "custom")) {
          // Custom types can't be fully represented, return any type
          return {
            $schema: "http://json-schema.org/draft-07/schema#",
          };
        }

        // Fallback: assume string
        return {
          type: "string",
          $schema: "http://json-schema.org/draft-07/schema#",
        };
      }

      // Handle other Zod 4 conversion errors
      if (error.message && (error.message.includes("undefined is not an object") || error.message.includes("_zod"))) {
        // This happens with certain complex schemas like z.record(z.unknown())
        // Try to handle it manually
        if (def && (def.typeName === "ZodObject" || def.type === "object")) {
          // Build object schema manually
          const properties: any = {};
          const shape = def.shape ? (typeof def.shape === "function" ? def.shape() : def.shape) : {};

          for (const [key, field] of Object.entries(shape)) {
            properties[key] = simplifyFieldSchema(field as z.ZodTypeAny);
          }

          return {
            type: "object",
            properties,
            additionalProperties: def.unknownKeys === "passthrough",
            $schema: "http://json-schema.org/draft-07/schema#",
          };
        }

        // Fallback
        return {
          type: "object",
          properties: {},
          $schema: "http://json-schema.org/draft-07/schema#",
        };
      }

      throw error;
    }

    // Convert to JSON Schema Draft 7 format
    if (jsonSchema.$schema && jsonSchema.$schema.includes("2020-12")) {
      jsonSchema.$schema = "http://json-schema.org/draft-07/schema#";
    }

    // Handle z.object({}).passthrough() - empty object with additionalProperties
    if (def && def.typeName === "ZodObject" && def.unknownKeys === "passthrough") {
      const shape = def.shape ? (typeof def.shape === "function" ? def.shape() : def.shape) : {};
      if (Object.keys(shape).length === 0) {
        return {
          type: "object",
          properties: {},
          additionalProperties: true,
          $schema: "http://json-schema.org/draft-07/schema#",
        };
      }
    }

    // Handle union types - convert oneOf/anyOf to array type format for compatibility
    if (jsonSchema.oneOf || jsonSchema.anyOf) {
      const schemas = jsonSchema.oneOf || jsonSchema.anyOf;
      // Extract types from oneOf/anyOf
      const types = schemas.map((s: any) => s.type).filter(Boolean);
      if (types.length > 0 && types.every((t: string) => typeof t === "string")) {
        jsonSchema.type = types;
        delete jsonSchema.oneOf;
        delete jsonSchema.anyOf;
      }
    }

    // Fix required fields - Zod 4 uses isOptional() method
    if (jsonSchema.type === "object" && jsonSchema.required && jsonSchema.properties) {
      const actualRequired: string[] = [];

      // Get the shape directly from schema
      const shape = (schema as any).shape;

      if (shape) {
        for (const [key, field] of Object.entries(shape)) {
          // In Zod 4, use isOptional() method to check if field is optional
          const isOptional = typeof (field as any).isOptional === "function" ? (field as any).isOptional() : false;

          if (!isOptional) {
            actualRequired.push(key);
          }
        }
      }

      jsonSchema.required = actualRequired.length > 0 ? actualRequired : undefined;
      if (!jsonSchema.required) {
        delete jsonSchema.required;
      }
    }

    // Fix additionalProperties for passthrough objects
    if (jsonSchema.type === "object") {
      // Fix root-level passthrough objects
      if (
        jsonSchema.additionalProperties &&
        typeof jsonSchema.additionalProperties === "object" &&
        Object.keys(jsonSchema.additionalProperties).length === 0
      ) {
        jsonSchema.additionalProperties = true;
      }

      // Fix nested passthrough objects
      if (jsonSchema.properties) {
        for (const [key, prop] of Object.entries(jsonSchema.properties as any)) {
          if (prop && typeof prop === "object" && prop.type === "object") {
            // Check if original schema has passthrough
            const shape = (schema as any).shape;
            if (shape) {
              const fieldSchema = shape[key];
              if (fieldSchema && (fieldSchema as any)._def?.unknownKeys === "passthrough") {
                prop.additionalProperties = true;
              } else if (
                prop.additionalProperties &&
                typeof prop.additionalProperties === "object" &&
                Object.keys(prop.additionalProperties).length === 0
              ) {
                prop.additionalProperties = true;
              }
            }
          }
        }
      }
    }

    return jsonSchema;
  }

  // Fall back to zod-to-json-schema for Zod 3.x
  try {
    const jsonSchema = zodToJsonSchemaV3(schema, {
      $refStrategy: options?.$refStrategy || "none",
      target: options?.target || "jsonSchema7",
    });

    // Clean up the schema
    if (jsonSchema && typeof jsonSchema === "object") {
      // Remove $schema if present
      delete (jsonSchema as any).$schema;

      // Handle passthrough objects (z.object({}).passthrough())
      if ((jsonSchema as any).type === "object" && (schema as any)._def?.unknownKeys === "passthrough") {
        (jsonSchema as any).additionalProperties = true;
      }

      // Fix empty additionalProperties
      if (
        (jsonSchema as any).additionalProperties &&
        typeof (jsonSchema as any).additionalProperties === "object" &&
        Object.keys((jsonSchema as any).additionalProperties).length === 0
      ) {
        (jsonSchema as any).additionalProperties = true;
      }

      // Fix nested passthrough objects
      if ((jsonSchema as any).properties) {
        for (const [key, prop] of Object.entries((jsonSchema as any).properties as any)) {
          if (prop && typeof prop === "object" && prop.type === "object") {
            // Check if original schema has passthrough
            const shape = (schema as any).shape;
            if (shape) {
              const fieldSchema = shape[key];
              if (fieldSchema && (fieldSchema as any)._def?.unknownKeys === "passthrough") {
                prop.additionalProperties = true;
              } else if (
                prop.additionalProperties &&
                typeof prop.additionalProperties === "object" &&
                Object.keys(prop.additionalProperties).length === 0
              ) {
                prop.additionalProperties = true;
              }
            }
          }
        }
      }
    }

    return jsonSchema;
  } catch (error) {
    throw new Error(`Schema conversion failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Export the compatibility function as default and named export
 * This matches the API of zod-to-json-schema
 */
export default zodToJsonSchemaCompat;
export { zodToJsonSchemaCompat as zodToJsonSchema };
