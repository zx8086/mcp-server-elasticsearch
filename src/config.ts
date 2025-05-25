/* src/config.ts */

import { z } from "zod";

// =============================================================================
// CONFIGURATION SCHEMAS
// =============================================================================

const ServerConfigSchema = z.object({
    name: z.string().min(1).default("elasticsearch-mcp-server"),
    version: z.string().min(1).default("0.1.1"),
    readOnlyMode: z.boolean().default(false),
    readOnlyStrictMode: z.boolean().default(true),
    maxQueryTimeout: z.number().min(1000).max(300000).default(30000),
    maxResultsPerQuery: z.number().min(1).max(10000).default(1000),
    transportMode: z.enum(['stdio', 'sse']).default('stdio'),
    port: z.number().default(8080),
});

const ElasticsearchConfigSchema = z.object({
    url: z.string().url().min(1),
    apiKey: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    caCert: z.string().optional(),
    maxRetries: z.number().min(0).max(10).default(3),
    requestTimeout: z.number().min(1000).max(60000).default(30000),
    compression: z.boolean().default(true),
    enableMetaHeader: z.boolean().default(true),
    disablePrototypePoisoningProtection: z.boolean().default(true),
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
        }
    );

const LoggingConfigSchema = z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    format: z.enum(["json", "text"]).default("json"),
    includeMetadata: z.boolean().default(true),
});

const SecurityConfigSchema = z.object({
    allowDestructiveOperations: z.boolean().default(false),
    allowSchemaModifications: z.boolean().default(false),
    allowIndexManagement: z.boolean().default(false),
    maxBulkOperations: z.number().min(1).max(10000).default(1000),
});

const ConfigSchema = z.object({
    server: ServerConfigSchema,
    elasticsearch: ElasticsearchConfigSchema,
    logging: LoggingConfigSchema,
    security: SecurityConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const defaultConfig: Config = {
    server: {
        name: "elasticsearch-mcp-server",
        version: "0.1.1",
        readOnlyMode: false,
        readOnlyStrictMode: true,
        maxQueryTimeout: 30000,
        maxResultsPerQuery: 1000,
        transportMode: 'stdio',
        port: 8080,
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
};

// =============================================================================
// ENVIRONMENT VARIABLE MAPPING
// =============================================================================

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
} as const;

// =============================================================================
// ENVIRONMENT VARIABLE LOADING
// =============================================================================

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
        name: parseEnvVar(process.env[envVarMapping.server.name], "string") as string || defaultConfig.server.name,
        version: parseEnvVar(process.env[envVarMapping.server.version], "string") as string || defaultConfig.server.version,
        readOnlyMode: parseEnvVar(process.env[envVarMapping.server.readOnlyMode], "boolean") as boolean ?? defaultConfig.server.readOnlyMode,
        readOnlyStrictMode: parseEnvVar(process.env[envVarMapping.server.readOnlyStrictMode], "boolean") as boolean ?? defaultConfig.server.readOnlyStrictMode,
        maxQueryTimeout: parseEnvVar(process.env[envVarMapping.server.maxQueryTimeout], "number") as number || defaultConfig.server.maxQueryTimeout,
        maxResultsPerQuery: parseEnvVar(process.env[envVarMapping.server.maxResultsPerQuery], "number") as number || defaultConfig.server.maxResultsPerQuery,
        transportMode: parseEnvVar(process.env[envVarMapping.server.transportMode], "string") as 'stdio' | 'sse' || defaultConfig.server.transportMode,
        port: parseEnvVar(process.env[envVarMapping.server.port], "number") as number || defaultConfig.server.port,
    };

    // Load elasticsearch config
    config.elasticsearch = {
        url: parseEnvVar(process.env[envVarMapping.elasticsearch.url], "string") as string || defaultConfig.elasticsearch.url,
        apiKey: parseEnvVar(process.env[envVarMapping.elasticsearch.apiKey], "string") as string,
        username: parseEnvVar(process.env[envVarMapping.elasticsearch.username], "string") as string,
        password: parseEnvVar(process.env[envVarMapping.elasticsearch.password], "string") as string,
        caCert: parseEnvVar(process.env[envVarMapping.elasticsearch.caCert], "string") as string,
        maxRetries: parseEnvVar(process.env[envVarMapping.elasticsearch.maxRetries], "number") as number || defaultConfig.elasticsearch.maxRetries,
        requestTimeout: parseEnvVar(process.env[envVarMapping.elasticsearch.requestTimeout], "number") as number || defaultConfig.elasticsearch.requestTimeout,
        compression: parseEnvVar(process.env[envVarMapping.elasticsearch.compression], "boolean") as boolean ?? defaultConfig.elasticsearch.compression,
        enableMetaHeader: parseEnvVar(process.env[envVarMapping.elasticsearch.enableMetaHeader], "boolean") as boolean ?? defaultConfig.elasticsearch.enableMetaHeader,
        disablePrototypePoisoningProtection: parseEnvVar(process.env[envVarMapping.elasticsearch.disablePrototypePoisoningProtection], "boolean") as boolean ?? defaultConfig.elasticsearch.disablePrototypePoisoningProtection,
    };

    // Load logging config
    config.logging = {
        level: parseEnvVar(process.env[envVarMapping.logging.level], "string") as "debug" | "info" | "warn" | "error" || defaultConfig.logging.level,
        format: parseEnvVar(process.env[envVarMapping.logging.format], "string") as "json" | "text" || defaultConfig.logging.format,
        includeMetadata: parseEnvVar(process.env[envVarMapping.logging.includeMetadata], "boolean") as boolean ?? defaultConfig.logging.includeMetadata,
    };

    // Load security config
    config.security = {
        allowDestructiveOperations: parseEnvVar(process.env[envVarMapping.security.allowDestructiveOperations], "boolean") as boolean ?? defaultConfig.security.allowDestructiveOperations,
        allowSchemaModifications: parseEnvVar(process.env[envVarMapping.security.allowSchemaModifications], "boolean") as boolean ?? defaultConfig.security.allowSchemaModifications,
        allowIndexManagement: parseEnvVar(process.env[envVarMapping.security.allowIndexManagement], "boolean") as boolean ?? defaultConfig.security.allowIndexManagement,
        maxBulkOperations: parseEnvVar(process.env[envVarMapping.security.maxBulkOperations], "number") as number || defaultConfig.security.maxBulkOperations,
    };

    return config;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateEnvironment(): { valid: boolean; errors: string[]; warnings?: string[] } {
    const requiredVars = ["ES_URL"];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            errors.push(`Missing required environment variable: ${varName}`);
        }
    }

    // Check for potential URL format issues
    if (process.env.ES_URL) {
        try {
            const url = new URL(process.env.ES_URL);
            if (!url.protocol.startsWith('http')) {
                errors.push("ES_URL must use http or https protocol");
            }

            // Check if it's an Elastic Cloud URL
            if (url.hostname.includes('.es.') && url.hostname.includes('.aws.cloud.es.io')) {
                warnings.push("Detected Elastic Cloud URL - ensure API key authentication is used");
            }
        } catch (e) {
            errors.push("ES_URL is not a valid URL format");
        }
    }

    // Check authentication configuration
    const hasApiKey = !!process.env.ES_API_KEY;
    const hasUsername = !!process.env.ES_USERNAME;
    const hasPassword = !!process.env.ES_PASSWORD;

    if (!hasApiKey && (!hasUsername || !hasPassword)) {
        warnings.push("No authentication configured. This may be fine for local development but should be set for production.");
    }

    if (hasUsername && !hasPassword) {
        errors.push("ES_USERNAME provided but ES_PASSWORD is missing");
    }

    if (hasPassword && !hasUsername) {
        errors.push("ES_PASSWORD provided but ES_USERNAME is missing");
    }

    // Check read-only configuration consistency
    const readOnlyMode = process.env.READ_ONLY_MODE?.toLowerCase() === 'true';
    const readOnlyStrictMode = process.env.READ_ONLY_STRICT_MODE?.toLowerCase() === 'true';

    if (!readOnlyMode && readOnlyStrictMode) {
        warnings.push("READ_ONLY_STRICT_MODE is enabled but READ_ONLY_MODE is disabled. STRICT_MODE will have no effect.");
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// =============================================================================
// CONFIGURATION INITIALIZATION
// =============================================================================

let config: Config;

try {
    // Validate environment first
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
        console.error("❌ Environment validation failed:", envValidation.errors.join(', '));
        if (envValidation.warnings && envValidation.warnings.length > 0) {
            console.warn("⚠️ Environment warnings:", envValidation.warnings.join(', '));
        }
        process.exit(1);
    }

    // Show warnings if any
    if (envValidation.warnings && envValidation.warnings.length > 0) {
        console.warn("⚠️ Environment warnings:", envValidation.warnings.join(', '));
    }

    // Merge default config with environment variables
    const envConfig = loadConfigFromEnv();
    const mergedConfig = {
        server: { ...defaultConfig.server, ...envConfig.server },
        elasticsearch: { ...defaultConfig.elasticsearch, ...envConfig.elasticsearch },
        logging: { ...defaultConfig.logging, ...envConfig.logging },
        security: { ...defaultConfig.security, ...envConfig.security },
    };

    // Validate and set configuration
    config = ConfigSchema.parse(mergedConfig);

    // Log successful configuration (to stderr to not interfere with MCP protocol)
    console.error("✅ Configuration loaded successfully:", JSON.stringify({
        server: {
            name: config.server.name,
            version: config.server.version,
            readOnlyMode: config.server.readOnlyMode,
            readOnlyStrictMode: config.server.readOnlyStrictMode,
            transportMode: config.server.transportMode,
            port: config.server.port,
        },
        elasticsearch: {
            url: config.elasticsearch.url,
            hasApiKey: !!config.elasticsearch.apiKey,
            hasUsername: !!config.elasticsearch.username,
            hasPassword: !!config.elasticsearch.password,
            hasCaCert: !!config.elasticsearch.caCert,
            maxRetries: config.elasticsearch.maxRetries,
            requestTimeout: config.elasticsearch.requestTimeout,
        },
        logging: {
            level: config.logging.level,
            format: config.logging.format,
        },
        security: {
            allowDestructiveOperations: config.security.allowDestructiveOperations,
            allowSchemaModifications: config.security.allowSchemaModifications,
            allowIndexManagement: config.security.allowIndexManagement,
        },
    }, null, 2));
} catch (error) {
    console.error("💥 Configuration validation failed:", error instanceof Error ? error.message : String(error));
    throw new Error("Invalid configuration: " + (error instanceof Error ? error.message : String(error)));
}

// =============================================================================
// EXPORTS
// =============================================================================

export { config, envVarMapping, defaultConfig };

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
        }
    };
}
