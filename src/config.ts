/* src/config.ts */

import { z } from "zod";

const ServerConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  readOnlyMode: z.boolean(),
  readOnlyStrictMode: z.boolean(),
  maxQueryTimeout: z.number().min(1000).max(300000),
  maxResultsPerQuery: z.number().min(1).max(10000),
  transportMode: z.enum(["stdio", "sse"]),
  port: z.number(),
  // Enhanced response handling configuration
  maxResponseSizeBytes: z.number().min(1000).max(10000000),
  defaultPageSize: z.number().min(1).max(1000),
  maxPageSize: z.number().min(10).max(10000),
  enableResponseCompression: z.boolean(),
  autoSummarizeLargeResponses: z.boolean(),
  // Monitoring configuration
  monitoringPort: z.number().min(1024).max(65535),
});

const ElasticsearchConfigSchema = z
  .object({
    url: z.string().url().min(1),
    apiKey: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    caCert: z.string().optional(),
    maxRetries: z.number().min(0).max(10),
    requestTimeout: z.number().min(1000).max(60000),
    compression: z.boolean(),
    enableMetaHeader: z.boolean(),
    disablePrototypePoisoningProtection: z.boolean(),
  })
  .refine(
    (data) => {
      // If username is provided, password must be provided
      if (data.username) {
        return !!data.password;
      }

      // If password is provided, username must be provided
      if (data.password) {
        return !!data.username;
      }

      // If apiKey is provided, it's valid
      if (data.apiKey) {
        return true;
      }

      // No auth is also valid (for local development)
      return true;
    },
    {
      message:
        "Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided, or no auth for local development",
      path: ["username", "password"],
    },
  );

const LoggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]),
  format: z.enum(["json", "text"]),
  includeMetadata: z.boolean(),
});

const SecurityConfigSchema = z.object({
  allowDestructiveOperations: z.boolean(),
  allowSchemaModifications: z.boolean(),
  allowIndexManagement: z.boolean(),
  maxBulkOperations: z.number().min(1).max(10000),
});

const LangSmithConfigSchema = z.object({
  tracing: z.boolean(),
  endpoint: z.string().url(),
  apiKey: z.string().optional(),
  project: z.string(),
});

const SessionTrackingConfigSchema = z.object({
  enabled: z.boolean(),
  sessionTimeoutMinutes: z.number().min(0.5).max(120),
  includeSessionInTraceName: z.boolean(),
  maxConcurrentSessions: z.number().min(10).max(1000),
  conversationDetectionThresholdSeconds: z.number().min(10).max(300),
});

const ConfigSchema = z.object({
  server: ServerConfigSchema,
  elasticsearch: ElasticsearchConfigSchema,
  logging: LoggingConfigSchema,
  security: SecurityConfigSchema,
  langsmith: LangSmithConfigSchema,
  sessionTracking: SessionTrackingConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;

const defaultConfig: Config = {
  server: {
    name: "elasticsearch-mcp-server",
    version: "0.1.1",
    readOnlyMode: false,
    readOnlyStrictMode: true,
    maxQueryTimeout: 30000,
    maxResultsPerQuery: 1000,
    transportMode: "stdio",
    port: 8080,
    maxResponseSizeBytes: 1000000,
    defaultPageSize: 20,
    maxPageSize: 100,
    enableResponseCompression: true,
    autoSummarizeLargeResponses: true,
    // Monitoring configuration
    monitoringPort: 9090,
  },
  elasticsearch: {
    url: "http://localhost:9200",
    maxRetries: 3,
    requestTimeout: 30000,
    compression: true,
    enableMetaHeader: true,
    disablePrototypePoisoningProtection: true,
  },
  logging: {
    level: "info",
    format: "json",
    includeMetadata: true,
  },
  security: {
    allowDestructiveOperations: false,
    allowSchemaModifications: false,
    allowIndexManagement: false,
    maxBulkOperations: 1000,
  },
  langsmith: {
    tracing: false,
    endpoint: "https://api.smith.langchain.com",
    project: "elasticsearch-mcp-server",
  },
  sessionTracking: {
    enabled: true,
    sessionTimeoutMinutes: 0.5, // 30 seconds for better conversation separation
    includeSessionInTraceName: false,
    maxConcurrentSessions: 100,
    conversationDetectionThresholdSeconds: 30, // Detect new conversation after 30s gap
  },
};

const envVarMapping = {
  server: {
    name: "MCP_SERVER_NAME",
    version: "MCP_SERVER_VERSION",
    readOnlyMode: "READ_ONLY_MODE",
    readOnlyStrictMode: "READ_ONLY_STRICT_MODE",
    maxQueryTimeout: "MCP_MAX_QUERY_TIMEOUT",
    maxResultsPerQuery: "MCP_MAX_RESULTS_PER_QUERY",
    transportMode: "MCP_TRANSPORT",
    port: "MCP_PORT",
    maxResponseSizeBytes: "MCP_MAX_RESPONSE_SIZE_BYTES",
    defaultPageSize: "MCP_DEFAULT_PAGE_SIZE",
    maxPageSize: "MCP_MAX_PAGE_SIZE",
    enableResponseCompression: "MCP_ENABLE_RESPONSE_COMPRESSION",
    autoSummarizeLargeResponses: "MCP_AUTO_SUMMARIZE_LARGE_RESPONSES",
    monitoringPort: "MONITORING_PORT",
  },
  elasticsearch: {
    url: "ES_URL",
    apiKey: "ES_API_KEY",
    username: "ES_USERNAME",
    password: "ES_PASSWORD",
    caCert: "ES_CA_CERT",
    maxRetries: "ES_MAX_RETRIES",
    requestTimeout: "ES_REQUEST_TIMEOUT",
    compression: "ES_COMPRESSION",
    enableMetaHeader: "ES_ENABLE_META_HEADER",
    disablePrototypePoisoningProtection: "ES_DISABLE_PROTOTYPE_POISONING_PROTECTION",
  },
  logging: {
    level: "LOG_LEVEL",
    format: "LOG_FORMAT",
    includeMetadata: "LOG_INCLUDE_METADATA",
  },
  security: {
    allowDestructiveOperations: "ALLOW_DESTRUCTIVE_OPERATIONS",
    allowSchemaModifications: "ALLOW_SCHEMA_MODIFICATIONS",
    allowIndexManagement: "ALLOW_INDEX_MANAGEMENT",
    maxBulkOperations: "MAX_BULK_OPERATIONS",
  },
  langsmith: {
    tracing: "LANGSMITH_TRACING",
    endpoint: "LANGSMITH_ENDPOINT",
    apiKey: "LANGSMITH_API_KEY",
    project: "LANGSMITH_PROJECT",
  },
  sessionTracking: {
    enabled: "SESSION_TRACKING_ENABLED",
    sessionTimeoutMinutes: "SESSION_TIMEOUT_MINUTES",
    includeSessionInTraceName: "SESSION_ID_IN_TRACE_NAME",
    maxConcurrentSessions: "MAX_CONCURRENT_SESSIONS",
    conversationDetectionThresholdSeconds: "CONVERSATION_DETECTION_THRESHOLD_SECONDS",
  },
} as const;

function parseEnvVar(value: string | undefined, type: "string" | "number" | "boolean"): unknown {
  if (value === undefined) return undefined;
  if (type === "number") return Number(value);
  if (type === "boolean") return value.toLowerCase() === "true";
  return value;
}

function loadConfigFromEnv(): Partial<Config> {
  const config: Partial<Config> = {};

  // Load server config
  config.server = {
    name: (parseEnvVar(Bun.env[envVarMapping.server.name], "string") as string) || defaultConfig.server.name,
    version: (parseEnvVar(Bun.env[envVarMapping.server.version], "string") as string) || defaultConfig.server.version,
    readOnlyMode:
      (parseEnvVar(Bun.env[envVarMapping.server.readOnlyMode], "boolean") as boolean) ??
      defaultConfig.server.readOnlyMode,
    readOnlyStrictMode:
      (parseEnvVar(Bun.env[envVarMapping.server.readOnlyStrictMode], "boolean") as boolean) ??
      defaultConfig.server.readOnlyStrictMode,
    maxQueryTimeout:
      (parseEnvVar(Bun.env[envVarMapping.server.maxQueryTimeout], "number") as number) ||
      defaultConfig.server.maxQueryTimeout,
    maxResultsPerQuery:
      (parseEnvVar(Bun.env[envVarMapping.server.maxResultsPerQuery], "number") as number) ||
      defaultConfig.server.maxResultsPerQuery,
    transportMode:
      (parseEnvVar(Bun.env[envVarMapping.server.transportMode], "string") as "stdio" | "sse") ||
      defaultConfig.server.transportMode,
    port: (parseEnvVar(Bun.env[envVarMapping.server.port], "number") as number) || defaultConfig.server.port,
    maxResponseSizeBytes:
      (parseEnvVar(Bun.env[envVarMapping.server.maxResponseSizeBytes], "number") as number) ||
      defaultConfig.server.maxResponseSizeBytes,
    defaultPageSize:
      (parseEnvVar(Bun.env[envVarMapping.server.defaultPageSize], "number") as number) ||
      defaultConfig.server.defaultPageSize,
    maxPageSize:
      (parseEnvVar(Bun.env[envVarMapping.server.maxPageSize], "number") as number) || defaultConfig.server.maxPageSize,
    enableResponseCompression:
      (parseEnvVar(Bun.env[envVarMapping.server.enableResponseCompression], "boolean") as boolean) ??
      defaultConfig.server.enableResponseCompression,
    autoSummarizeLargeResponses:
      (parseEnvVar(Bun.env[envVarMapping.server.autoSummarizeLargeResponses], "boolean") as boolean) ??
      defaultConfig.server.autoSummarizeLargeResponses,
    monitoringPort:
      (parseEnvVar(Bun.env[envVarMapping.server.monitoringPort], "number") as number) ||
      defaultConfig.server.monitoringPort,
  };

  // Load elasticsearch config
  config.elasticsearch = {
    url: (parseEnvVar(Bun.env[envVarMapping.elasticsearch.url], "string") as string) || defaultConfig.elasticsearch.url,
    apiKey: parseEnvVar(Bun.env[envVarMapping.elasticsearch.apiKey], "string") as string,
    username: parseEnvVar(Bun.env[envVarMapping.elasticsearch.username], "string") as string,
    password: parseEnvVar(Bun.env[envVarMapping.elasticsearch.password], "string") as string,
    caCert: parseEnvVar(Bun.env[envVarMapping.elasticsearch.caCert], "string") as string,
    maxRetries:
      (parseEnvVar(Bun.env[envVarMapping.elasticsearch.maxRetries], "number") as number) ||
      defaultConfig.elasticsearch.maxRetries,
    requestTimeout:
      (parseEnvVar(Bun.env[envVarMapping.elasticsearch.requestTimeout], "number") as number) ||
      defaultConfig.elasticsearch.requestTimeout,
    compression:
      (parseEnvVar(Bun.env[envVarMapping.elasticsearch.compression], "boolean") as boolean) ??
      defaultConfig.elasticsearch.compression,
    enableMetaHeader:
      (parseEnvVar(Bun.env[envVarMapping.elasticsearch.enableMetaHeader], "boolean") as boolean) ??
      defaultConfig.elasticsearch.enableMetaHeader,
    disablePrototypePoisoningProtection:
      (parseEnvVar(Bun.env[envVarMapping.elasticsearch.disablePrototypePoisoningProtection], "boolean") as boolean) ??
      defaultConfig.elasticsearch.disablePrototypePoisoningProtection,
  };

  // Load logging config
  config.logging = {
    level:
      (parseEnvVar(Bun.env[envVarMapping.logging.level], "string") as "debug" | "info" | "warn" | "error") ||
      defaultConfig.logging.level,
    format:
      (parseEnvVar(Bun.env[envVarMapping.logging.format], "string") as "json" | "text") || defaultConfig.logging.format,
    includeMetadata:
      (parseEnvVar(Bun.env[envVarMapping.logging.includeMetadata], "boolean") as boolean) ??
      defaultConfig.logging.includeMetadata,
  };

  // Load security config
  config.security = {
    allowDestructiveOperations:
      (parseEnvVar(Bun.env[envVarMapping.security.allowDestructiveOperations], "boolean") as boolean) ??
      defaultConfig.security.allowDestructiveOperations,
    allowSchemaModifications:
      (parseEnvVar(Bun.env[envVarMapping.security.allowSchemaModifications], "boolean") as boolean) ??
      defaultConfig.security.allowSchemaModifications,
    allowIndexManagement:
      (parseEnvVar(Bun.env[envVarMapping.security.allowIndexManagement], "boolean") as boolean) ??
      defaultConfig.security.allowIndexManagement,
    maxBulkOperations:
      (parseEnvVar(Bun.env[envVarMapping.security.maxBulkOperations], "number") as number) ||
      defaultConfig.security.maxBulkOperations,
  };

  // Load LangSmith config
  config.langsmith = {
    tracing:
      (parseEnvVar(Bun.env[envVarMapping.langsmith.tracing], "boolean") as boolean) ?? defaultConfig.langsmith.tracing,
    endpoint:
      (parseEnvVar(Bun.env[envVarMapping.langsmith.endpoint], "string") as string) || defaultConfig.langsmith.endpoint,
    apiKey: parseEnvVar(Bun.env[envVarMapping.langsmith.apiKey], "string") as string,
    project:
      (parseEnvVar(Bun.env[envVarMapping.langsmith.project], "string") as string) || defaultConfig.langsmith.project,
  };

  // Load Session Tracking config
  config.sessionTracking = {
    enabled:
      (parseEnvVar(Bun.env[envVarMapping.sessionTracking.enabled], "boolean") as boolean) ?? defaultConfig.sessionTracking.enabled,
    sessionTimeoutMinutes:
      (parseEnvVar(Bun.env[envVarMapping.sessionTracking.sessionTimeoutMinutes], "number") as number) ||
      defaultConfig.sessionTracking.sessionTimeoutMinutes,
    includeSessionInTraceName:
      (parseEnvVar(Bun.env[envVarMapping.sessionTracking.includeSessionInTraceName], "boolean") as boolean) ??
      defaultConfig.sessionTracking.includeSessionInTraceName,
    maxConcurrentSessions:
      (parseEnvVar(Bun.env[envVarMapping.sessionTracking.maxConcurrentSessions], "number") as number) ||
      defaultConfig.sessionTracking.maxConcurrentSessions,
    conversationDetectionThresholdSeconds:
      (parseEnvVar(Bun.env[envVarMapping.sessionTracking.conversationDetectionThresholdSeconds], "number") as number) ||
      defaultConfig.sessionTracking.conversationDetectionThresholdSeconds,
  };

  return config;
}

export function validateEnvironment(): { valid: boolean; errors: string[]; warnings?: string[] } {
  const requiredVars = ["ES_URL"];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const varName of requiredVars) {
    if (!Bun.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Check for potential URL format issues
  if (Bun.env.ES_URL) {
    try {
      const url = new URL(Bun.env.ES_URL);
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

  // Check authentication configuration
  const hasApiKey = !!Bun.env.ES_API_KEY;
  const hasUsername = !!Bun.env.ES_USERNAME;
  const hasPassword = !!Bun.env.ES_PASSWORD;

  if (!hasApiKey && (!hasUsername || !hasPassword)) {
    warnings.push(
      "No authentication configured. This may be fine for local development but should be set for production.",
    );
  }

  if (hasUsername && !hasPassword) {
    errors.push("ES_USERNAME provided but ES_PASSWORD is missing");
  }

  if (hasPassword && !hasUsername) {
    errors.push("ES_PASSWORD provided but ES_USERNAME is missing");
  }

  // Check read-only configuration consistency
  const readOnlyMode = Bun.env.READ_ONLY_MODE?.toLowerCase() === "true";
  const readOnlyStrictMode = Bun.env.READ_ONLY_STRICT_MODE?.toLowerCase() === "true";

  if (!readOnlyMode && readOnlyStrictMode) {
    warnings.push("READ_ONLY_STRICT_MODE is enabled but READ_ONLY_MODE is disabled. STRICT_MODE will have no effect.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

let config: Config;

try {
  // Validate environment first
  const envValidation = validateEnvironment();
  if (!envValidation.valid) {
    // Use stderr for critical errors that prevent startup
    console.error(
      JSON.stringify({
        level: "ERROR",
        message: "Environment validation failed",
        errors: envValidation.errors,
      }),
    );
    process.exit(1);
  }

  // Store warnings to be logged later after logger initialization
  const configWarnings = envValidation.warnings || [];

  // Merge default config with environment variables
  const envConfig = loadConfigFromEnv();
  const mergedConfig = {
    server: { ...defaultConfig.server, ...envConfig.server },
    elasticsearch: { ...defaultConfig.elasticsearch, ...envConfig.elasticsearch },
    logging: { ...defaultConfig.logging, ...envConfig.logging },
    security: { ...defaultConfig.security, ...envConfig.security },
    langsmith: { ...defaultConfig.langsmith, ...envConfig.langsmith },
    sessionTracking: { ...defaultConfig.sessionTracking, ...envConfig.sessionTracking },
  };

  // Validate merged configuration against schemas
  config = ConfigSchema.parse(mergedConfig);

  // Store warnings in config for later logging
  (config as any)._configWarnings = configWarnings;

  // Don't log here - let the logger handle it after initialization
} catch (error) {
  // Use structured logging for errors
  console.error(
    JSON.stringify({
      level: "ERROR",
      message: "Configuration validation failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  throw new Error(`Invalid configuration: ${error instanceof Error ? error.message : String(error)}`);
}

export { config, envVarMapping, defaultConfig };

// Helper function to get the configuration
export function getConfig(): Config {
  return config;
}

// Helper function to get configuration warnings
export function getConfigWarnings(): string[] {
  return (config as any)._configWarnings || [];
}

// Helper function to clear configuration warnings after logging
export function clearConfigWarnings(): void {
  (config as any)._configWarnings = undefined;
}

// Helper function to get configuration documentation
export function getConfigDocumentation(): Record<string, any> {
  return {
    environmentVariables: envVarMapping,
    defaults: defaultConfig,
    schemas: {
      server: ServerConfigSchema.describe("Server configuration options"),
      elasticsearch: ElasticsearchConfigSchema.describe("Elasticsearch connection configuration"),
      logging: LoggingConfigSchema.describe("Logging configuration"),
      security: SecurityConfigSchema.describe("Security and permission configuration"),
      langsmith: LangSmithConfigSchema.describe("LangSmith tracing configuration"),
    },
  };
}