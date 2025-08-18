/* src/utils/parameterValidator.ts */

import { z } from "zod";
import { logger } from "./logger.js";

export interface ValidationError {
  field: string;
  message: string;
  required: boolean;
  providedValue?: any;
}

export interface ParameterInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: any;
  enumValues?: string[];
}

/**
 * Extract parameter information from a Zod schema
 */
export function extractParameterInfo(schema: z.ZodTypeAny): ParameterInfo[] {
  const params: ParameterInfo[] = [];
  
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const info = extractFieldInfo(key, fieldSchema as z.ZodTypeAny);
      if (info) {
        params.push(info);
      }
    }
  }
  
  return params;
}

/**
 * Extract information from a single field
 */
function extractFieldInfo(name: string, schema: z.ZodTypeAny): ParameterInfo | null {
  if (!schema || typeof schema !== "object") {
    return null;
  }
  
  const def = (schema as any)._def;
  if (!def) {
    return null;
  }
  
  const info: ParameterInfo = {
    name,
    type: getSchemaType(schema),
    required: !isOptional(schema),
  };
  
  // In Zod 4, description is stored directly on the schema object
  if ((schema as any).description) {
    info.description = (schema as any).description;
  } else if (def.description) {
    // Fallback to _def.description (Zod 3.x)
    info.description = def.description;
  } else if (def.checks) {
    // Look for description in checks (older Zod versions)
    const descCheck = def.checks?.find((c: any) => c.kind === "description");
    if (descCheck?.description) {
      info.description = descCheck.description;
    }
  }
  
  // Extract default value
  const defaultValue = getDefaultValue(schema);
  if (defaultValue !== undefined) {
    info.defaultValue = defaultValue;
  }
  
  // Extract enum values
  const type = def.type || def.typeName;
  if ((type === "enum" || type === "ZodEnum") && (def.entries || def.values)) {
    // Zod 4 uses 'entries', Zod 3 uses 'values'
    info.enumValues = def.entries ? Object.values(def.entries) : def.values;
  }
  
  return info;
}

/**
 * Get the type name for a Zod schema
 */
function getSchemaType(schema: z.ZodTypeAny): string {
  const def = (schema as any)._def;
  
  if (!def) {
    return "unknown";
  }
  
  // Zod 4 uses 'type' instead of 'typeName'
  const type = def.type || def.typeName;
  
  switch (type) {
    case "string":
    case "ZodString":
      return "string";
    case "number":
    case "ZodNumber":
      return "number";
    case "boolean":
    case "ZodBoolean":
      return "boolean";
    case "array":
    case "ZodArray":
      return "array";
    case "object":
    case "ZodObject":
      return "object";
    case "enum":
    case "ZodEnum":
      // For enums, try to get the values
      if (def.values) {
        return `enum(${Object.values(def.values).join(", ")})`;
      } else if (def.entries) {
        return `enum(${Object.values(def.entries).join(", ")})`;
      }
      return "enum";
    case "optional":
    case "ZodOptional":
      return getSchemaType(def.innerType);
    case "default":
    case "ZodDefault":
      return getSchemaType(def.innerType);
    case "nullable":
    case "ZodNullable":
      return `${getSchemaType(def.innerType)} | null`;
    case "union":
    case "ZodUnion":
      return "union";
    case "custom":
    case "ZodCustom":
      return "custom";
    case "date":
    case "ZodDate":
      return "date";
    case "bigint":
    case "ZodBigInt":
      return "bigint";
    case "undefined":
    case "ZodUndefined":
      return "undefined";
    case "null":
    case "ZodNull":
      return "null";
    case "void":
    case "ZodVoid":
      return "void";
    case "any":
    case "ZodAny":
      return "any";
    case "unknown":
    case "ZodUnknown":
      return "unknown";
    case "never":
    case "ZodNever":
      return "never";
    default:
      // Try to clean up the type name
      if (typeof type === "string") {
        return type.replace("Zod", "").toLowerCase();
      }
      return "unknown";
  }
}

/**
 * Check if a schema is optional
 */
function isOptional(schema: z.ZodTypeAny): boolean {
  const def = (schema as any)._def;
  
  if (!def) {
    return false;
  }
  
  // Zod 4 uses 'type' instead of 'typeName'
  const type = def.type || def.typeName;
  
  // Check if it's directly optional
  if (type === "optional" || type === "ZodOptional") {
    return true;
  }
  
  // Check if it has a default value
  if (type === "default" || type === "ZodDefault") {
    return true;
  }
  
  // Check using the isOptional method
  if (typeof (schema as any).isOptional === "function") {
    try {
      return (schema as any).isOptional();
    } catch {
      return false;
    }
  }
  
  return false;
}

/**
 * Get the default value for a schema
 */
function getDefaultValue(schema: z.ZodTypeAny): any {
  const def = (schema as any)._def;
  
  if (!def) {
    return undefined;
  }
  
  // Zod 4 uses 'type' instead of 'typeName'
  const type = def.type || def.typeName;
  
  if ((type === "default" || type === "ZodDefault") && def.defaultValue !== undefined) {
    // In Zod 4, defaultValue might be a getter
    if (typeof def.defaultValue === "function" || def.defaultValue instanceof Function) {
      try {
        return def.defaultValue();
      } catch {
        return undefined;
      }
    }
    return def.defaultValue;
  }
  
  // Check for inner default
  if (def.innerType) {
    return getDefaultValue(def.innerType);
  }
  
  return undefined;
}

/**
 * Validate parameters and provide detailed error messages
 */
export function validateParameters(
  toolName: string,
  schema: z.ZodTypeAny,
  params: any
): { valid: boolean; errors: ValidationError[]; suggestions: string[] } {
  const errors: ValidationError[] = [];
  const suggestions: string[] = [];
  
  // Check if params is undefined or null
  if (params === undefined || params === null) {
    const paramInfo = extractParameterInfo(schema);
    const requiredParams = paramInfo.filter(p => p.required);
    
    if (requiredParams.length > 0) {
      errors.push({
        field: "[root]",
        message: "No parameters provided but required parameters exist",
        required: true,
      });
      
      suggestions.push(
        `Please provide the following required parameters: ${requiredParams.map(p => p.name).join(", ")}`
      );
    }
    
    return { valid: errors.length === 0, errors, suggestions };
  }
  
  // Check if params is an empty object
  if (typeof params === "object" && Object.keys(params).length === 0) {
    const paramInfo = extractParameterInfo(schema);
    const requiredParams = paramInfo.filter(p => p.required);
    
    if (requiredParams.length > 0) {
      for (const param of requiredParams) {
        errors.push({
          field: param.name,
          message: `Required parameter "${param.name}" is missing`,
          required: true,
        });
      }
      
      // Create example with required params
      const example: any = {};
      for (const param of requiredParams) {
        if (param.enumValues && param.enumValues.length > 0) {
          example[param.name] = param.enumValues[0];
        } else if (param.type === "string") {
          example[param.name] = param.description || `<${param.name}>`;
        } else if (param.type === "number") {
          example[param.name] = 0;
        } else if (param.type === "boolean") {
          example[param.name] = false;
        } else {
          example[param.name] = null;
        }
      }
      
      suggestions.push(
        `Example usage: ${JSON.stringify(example, null, 2)}`
      );
    }
    
    return { valid: errors.length === 0, errors, suggestions };
  }
  
  // Validate using Zod
  try {
    schema.parse(params);
    return { valid: true, errors: [], suggestions: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        const field = issue.path.join(".");
        
        errors.push({
          field: field || "[root]",
          message: issue.message,
          required: issue.code === "invalid_type" && issue.received === "undefined",
          providedValue: issue.code === "invalid_type" ? issue.received : undefined,
        });
        
        // Add specific suggestions based on error type
        if (issue.code === "invalid_type") {
          if (issue.received === "undefined") {
            suggestions.push(`Parameter "${field}" is required and must be of type ${issue.expected}`);
          } else {
            suggestions.push(
              `Parameter "${field}" must be of type ${issue.expected}, but received ${issue.received}`
            );
          }
        } else if (issue.code === "invalid_enum_value") {
          suggestions.push(
            `Parameter "${field}" must be one of: ${(issue as any).options?.join(", ")}`
          );
        } else if (issue.code === "too_small") {
          suggestions.push(
            `Parameter "${field}" must be at least ${(issue as any).minimum} characters/items`
          );
        }
      }
    } else {
      errors.push({
        field: "[validation]",
        message: error instanceof Error ? error.message : String(error),
        required: false,
      });
    }
  }
  
  return { valid: false, errors, suggestions };
}

/**
 * Generate helpful parameter documentation
 */
export function generateParameterHelp(toolName: string, schema: z.ZodTypeAny): string {
  const params = extractParameterInfo(schema);
  
  if (params.length === 0) {
    return `Tool "${toolName}" requires no parameters.`;
  }
  
  const lines: string[] = [
    `Tool: ${toolName}`,
    "",
    "Parameters:",
  ];
  
  for (const param of params) {
    const required = param.required ? " (REQUIRED)" : " (optional)";
    const defaultStr = param.defaultValue !== undefined ? ` [default: ${JSON.stringify(param.defaultValue)}]` : "";
    const enumStr = param.enumValues ? ` [values: ${param.enumValues.join(", ")}]` : "";
    
    lines.push(`  - ${param.name}: ${param.type}${required}${defaultStr}${enumStr}`);
    
    if (param.description) {
      lines.push(`    ${param.description}`);
    }
  }
  
  // Add example
  lines.push("");
  lines.push("Example:");
  
  const example: any = {};
  for (const param of params) {
    if (param.required || param.defaultValue === undefined) {
      if (param.enumValues && param.enumValues.length > 0) {
        example[param.name] = param.enumValues[0];
      } else if (param.type === "string") {
        example[param.name] = param.description?.toLowerCase().includes("pattern") 
          ? "*" 
          : `example_${param.name}`;
      } else if (param.type === "number") {
        example[param.name] = param.name.toLowerCase().includes("limit") ? 10 : 1;
      } else if (param.type === "boolean") {
        example[param.name] = false;
      } else {
        example[param.name] = null;
      }
    }
  }
  
  lines.push(JSON.stringify(example, null, 2));
  
  return lines.join("\n");
}