/**
 * Shared Zod helpers for parameter coercion
 *
 * MCP clients often send parameters as strings even when the schema expects
 * booleans or numbers. These helpers provide consistent coercion across all tools.
 */

import { z } from "zod";

/**
 * Coerce string booleans to actual booleans
 * Accepts: true, false, "true", "false", "1", "0"
 */
export const coerceBoolean = z.union([z.boolean(), z.string().transform((val) => val === "true" || val === "1")]);

/**
 * Coerce string numbers to actual numbers
 * Accepts: number or string representation of a number
 */
export const coerceNumber = z.union([
  z.number(),
  z.string().transform((val) => {
    const num = Number(val);
    if (Number.isNaN(num)) {
      throw new Error(`Invalid number: ${val}`);
    }
    return num;
  }),
]);

/**
 * Coerce string integers to actual integers
 * Accepts: number or string representation of an integer
 */
export const coerceInteger = z.union([
  z.number(),
  z.string().transform((val) => {
    const num = Number.parseInt(val, 10);
    if (Number.isNaN(num)) {
      throw new Error(`Invalid integer: ${val}`);
    }
    return num;
  }),
]);

/**
 * Create a coerced boolean field with default value
 */
export const booleanField = (defaultValue = false, description?: string) => {
  const field = coerceBoolean.default(defaultValue);
  return description ? field.describe(description) : field;
};

/**
 * Create a coerced number field with constraints
 */
export const numberField = (options: {
  min?: number;
  max?: number;
  default?: number;
  description?: string;
}) => {
  let field = coerceNumber;

  if (options.min !== undefined || options.max !== undefined) {
    const constraints = z.number();
    if (options.min !== undefined) {
      field = field.pipe(constraints.min(options.min));
    }
    if (options.max !== undefined) {
      field = field.pipe(constraints.max(options.max));
    }
  }

  if (options.default !== undefined) {
    field = field.default(options.default);
  }

  if (options.description) {
    field = field.describe(options.description);
  }

  return field;
};

/**
 * Create a coerced integer field with constraints
 */
export const integerField = (options: {
  min?: number;
  max?: number;
  default?: number;
  description?: string;
}) => {
  let field = coerceInteger;

  if (options.min !== undefined || options.max !== undefined) {
    const constraints = z.number();
    if (options.min !== undefined) {
      field = field.pipe(constraints.min(options.min));
    }
    if (options.max !== undefined) {
      field = field.pipe(constraints.max(options.max));
    }
  }

  if (options.default !== undefined) {
    field = field.default(options.default);
  }

  if (options.description) {
    field = field.describe(options.description);
  }

  return field;
};

/**
 * Coerce JSON string to object or array
 * Accepts: object/array or JSON string representation
 */
export const coerceJson = z.preprocess(
  (val) => {
    // If it's already an object or array, return as-is
    if (typeof val === "object" && val !== null) {
      return val;
    }

    // If it's a string, try to parse it as JSON
    if (typeof val === "string") {
      try {
        // First, try to clean up common issues with escaped quotes
        let cleanedVal = val;

        // Handle double-escaped quotes
        if (val.includes('\\"')) {
          cleanedVal = val.replace(/\\"/g, '"');
        }

        // Handle escaped backslashes
        if (cleanedVal.includes("\\\\")) {
          cleanedVal = cleanedVal.replace(/\\\\/g, "\\");
        }

        const parsed = JSON.parse(cleanedVal);
        if (typeof parsed !== "object" || parsed === null) {
          throw new Error("Parsed value is not an object or array");
        }
        return parsed;
      } catch (error) {
        // If parsing fails, try one more time with aggressive cleanup
        try {
          // Remove all backslashes before quotes
          const aggressiveClean = val.replace(/\\(.)/g, "$1");
          const parsed = JSON.parse(aggressiveClean);
          if (typeof parsed === "object" && parsed !== null) {
            return parsed;
          }
        } catch (secondError) {
          // If all parsing attempts fail, return the original to let Zod handle the error
        }
        return val;
      }
    }

    // For other types, return as-is and let Zod validate
    return val;
  },
  z.union([z.object({}).passthrough(), z.array(z.any())]),
);

/**
 * Create a JSON field that accepts either an object or JSON string
 * Useful for queryBody and similar parameters that may come as strings
 */
export const jsonField = (defaultValue?: any, description?: string) => {
  let field = coerceJson;

  if (defaultValue !== undefined) {
    field = field.default(defaultValue);
  }

  if (description) {
    field = field.describe(description);
  }

  return field;
};
