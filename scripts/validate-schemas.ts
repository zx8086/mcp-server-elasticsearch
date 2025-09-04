#!/usr/bin/env bun

/**
 * Schema Validation Script for MCP Tools
 *
 * This script validates that all MCP tools use proper schema formats
 * and detects common issues like passing raw Zod objects without conversion.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { zodToJsonSchemaCompat as zodToJsonSchema } from "../src/utils/zodToJsonSchema.js";

// Check version compatibility
async function checkVersionCompatibility() {
  const packageJson = JSON.parse(await readFile("package.json", "utf-8"));
  const zodVersion = packageJson.dependencies?.zod || "";

  // Extract major version numbers
  const zodMajor = Number.parseInt(zodVersion.replace(/[\^~]/, "").split(".")[0]);

  if (zodMajor < 4) {
    console.warn("⚠️  Using Zod 3.x - consider upgrading to Zod 4.x");
    console.log(`   Zod: ${zodVersion}`);
  } else {
    console.log("✅ Using Zod 4.x with custom compatibility wrapper");
    console.log(`   Zod: ${zodVersion}`);
    console.log("   Compatibility wrapper: src/utils/zodToJsonSchema.ts");
  }

  return true;
}

interface ValidationResult {
  file: string;
  tool: string;
  status: "valid" | "invalid" | "warning";
  message: string;
  details?: any;
}

const results: ValidationResult[] = [];

// Note: Helper functions removed as they're not currently used
// Can be re-added if needed for more advanced validation

/**
 * Validate a single tool file
 */
async function validateToolFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf-8");
  const fileName = filePath.split("/").pop() || "";

  // Check for different patterns
  const patterns = [
    {
      // Pattern 1: Direct server.tool() with Zod object (BAD)
      regex: /server\.tool\([^,]+,[^,]+,\s*z\.object\(/g,
      status: "invalid" as const,
      message: "Direct use of z.object() in server.tool() - needs conversion",
    },
    {
      // Pattern 2: registerTracedTool with inputSchema (GOOD if converted)
      regex: /registerTracedTool\([^{]+\{[^}]*inputSchema[^}]*\}/g,
      status: "valid" as const,
      message: "Using registerTracedTool with proper conversion",
    },
    {
      // Pattern 3: server.tool() with plain object containing z validators (GOOD)
      regex: /server\.tool\([^,]+,[^,]+,\s*\{[^}]*z\.[a-z]+\(/g,
      status: "valid" as const,
      message: "Using plain object with Zod validators",
    },
    {
      // Pattern 4: Check for missing zod-to-json-schema import when using z.object
      regex: /z\.object\(/g,
      check: (content: string) => {
        if (content.includes("z.object(") && !content.includes("zodToJsonSchema")) {
          return {
            status: "warning" as const,
            message: "Uses z.object() but missing zodToJsonSchema import",
          };
        }
        return null;
      },
    },
  ];

  for (const pattern of patterns) {
    if (pattern.check) {
      const result = pattern.check(content);
      if (result) {
        results.push({
          file: fileName,
          tool: fileName.replace(".ts", ""),
          status: result.status,
          message: result.message,
        });
      }
    } else if (pattern.regex.test(content)) {
      results.push({
        file: fileName,
        tool: fileName.replace(".ts", ""),
        status: pattern.status,
        message: pattern.message,
      });
    }
  }
}

/**
 * Recursively find all TypeScript tool files
 */
async function findToolFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findToolFiles(fullPath)));
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Test schema conversion
 */
function testSchemaConversion() {
  console.log("\n📋 Testing Schema Conversion:\n");

  // Test case 1: Plain object with Zod validators (MCP SDK compatible)
  const _plainObjectSchema = {
    name: z.string().min(1),
    age: z.number().positive(),
  };

  console.log("✅ Plain object with Zod validators:");
  console.log("   MCP SDK can handle this directly\n");

  // Test case 2: Zod object (needs conversion)
  const zodObjectSchema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
  });

  console.log("❌ Zod object without conversion:");
  console.log("   Will include internal Zod metadata\n");

  // Test case 3: Properly converted Zod object
  const convertedSchema = zodToJsonSchema(zodObjectSchema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  });

  console.log("✅ Properly converted Zod object:");
  console.log(`${JSON.stringify(convertedSchema, null, 2).substring(0, 200)}...\n`);
}

/**
 * Main validation function
 */
async function main() {
  console.log("🔍 MCP Tool Schema Validator\n");
  console.log("=".repeat(60));

  // Check version compatibility first
  console.log("\n📦 Checking dependency versions...\n");
  const versionOk = await checkVersionCompatibility();
  if (!versionOk) {
    process.exit(1);
  }

  // Test schema conversion examples
  testSchemaConversion();

  console.log("=".repeat(60));
  console.log("\n📂 Scanning tool files...\n");

  const toolsDir = join(process.cwd(), "src", "tools");
  const toolFiles = await findToolFiles(toolsDir);

  console.log(`Found ${toolFiles.length} tool files\n`);

  // Validate each file
  for (const file of toolFiles) {
    await validateToolFile(file);
  }

  // Group results by status
  const invalid = results.filter((r) => r.status === "invalid");
  const warnings = results.filter((r) => r.status === "warning");
  const valid = results.filter((r) => r.status === "valid");

  // Display results
  if (invalid.length > 0) {
    console.log("❌ Invalid Schemas Found:\n");
    for (const r of invalid) {
      console.log(`   ${r.file}: ${r.message}`);
    }
    console.log();
  }

  if (warnings.length > 0) {
    console.log("⚠️  Warnings:\n");
    for (const r of warnings) {
      console.log(`   ${r.file}: ${r.message}`);
    }
    console.log();
  }

  console.log("📊 Summary:");
  console.log(`   ✅ Valid: ${valid.length}`);
  console.log(`   ⚠️  Warnings: ${warnings.length}`);
  console.log(`   ❌ Invalid: ${invalid.length}`);

  if (invalid.length > 0) {
    console.log("\n❗ Action Required:");
    console.log("   Fix invalid schemas by either:");
    console.log("   1. Using plain objects with Zod validators");
    console.log("   2. Converting Zod objects with zodToJsonSchema");
    console.log("   3. Using registerTracedTool which handles conversion");
    process.exit(1);
  }

  console.log("\n✅ All schemas are properly configured!");
}

// Run the validator
main().catch(console.error);
