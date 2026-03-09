/* src/validation.ts */

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export function validateEnvironment(): ValidationResult {
  const requiredVars = ["ES_URL"];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Check READ_ONLY_MODE configuration
  if (process.env.READ_ONLY_MODE) {
    const readOnlyValue = process.env.READ_ONLY_MODE.toLowerCase();
    if (!["true", "false", "1", "0"].includes(readOnlyValue)) {
      warnings.push("READ_ONLY_MODE should be 'true', 'false', '1', or '0'. Defaulting to false.");
    } else if (["true", "1"].includes(readOnlyValue)) {
      warnings.push("READ_ONLY_MODE is enabled - destructive operations will be restricted");
    }
  }

  // Check READ_ONLY_STRICT_MODE
  if (process.env.READ_ONLY_STRICT_MODE) {
    const strictValue = process.env.READ_ONLY_STRICT_MODE.toLowerCase();
    if (!["true", "false", "1", "0"].includes(strictValue)) {
      warnings.push("READ_ONLY_STRICT_MODE should be 'true', 'false', '1', or '0'. Defaulting to true.");
    }
  }

  // Check for potential URL format issues
  if (process.env.ES_URL) {
    try {
      const url = new URL(process.env.ES_URL);
      if (!url.protocol.startsWith("http")) {
        errors.push("ES_URL must use http or https protocol");
      }

      // Check if it's an Elastic Cloud URL
      if (url.hostname.includes(".es.") && url.hostname.includes(".aws.cloud.es.io")) {
        warnings.push("Detected Elastic Cloud URL - ensure API key authentication is used");
      }
    } catch (_e) {
      errors.push("ES_URL is not a valid URL format");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateConfig(config: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.url) {
    errors.push("ES_URL is required");
  }

  if (!config.apiKey && (!config.username || !config.password)) {
    errors.push("Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided");
  }

  // Validate read-only mode configuration
  if (config.readOnlyMode === true) {
    warnings.push("Server will run in READ-ONLY mode - destructive operations restricted");
  }

  // Check for Elastic Cloud specific requirements
  if (config.url?.includes(".es.") && config.url.includes(".aws.cloud.es.io")) {
    if (!config.apiKey) {
      warnings.push("Elastic Cloud detected but no API key provided - API key authentication is recommended");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
