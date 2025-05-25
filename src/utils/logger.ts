/* src/utils/logger.ts */

interface LogMetadata {
  [key: string]: any;
}

interface LogData {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  [key: string]: any;
}

export class MCPCompatibleLogger {
  private context: string;
  private metadata: LogMetadata;

  constructor(context: string = "elasticsearch-mcp-server", metadata: LogMetadata = {}) {
    this.context = context;
    this.metadata = metadata;
  }

  private formatMessage(level: string, message: string, metadata: LogMetadata = {}): string {
    const timestamp = new Date().toISOString();
    const logData: LogData = {
      timestamp,
      level,
      context: this.context,
      message,
      ...this.metadata,
      ...metadata,
    };

    // Remove undefined values
    Object.keys(logData).forEach(key => {
      if (logData[key] === undefined) {
        delete logData[key];
      }
    });

    // Return formatted JSON string
    return JSON.stringify(logData);
  }

  private shouldLog(level: string): boolean {
    const levels = ["debug", "info", "warn", "error"];
    const configLevel = process.env.LOG_LEVEL || "info";
    return levels.indexOf(level) >= levels.indexOf(configLevel);
  }

  // CRITICAL: Write to stderr but ensure MCP compatibility
  private writeToStderr(message: string): void {
    // Always write to stderr, but ensure it's properly formatted JSON
    // This matches the behavior of other MCP servers
    process.stderr.write(message + "\n");
  }

  debug(message: string, metadata: LogMetadata = {}): void {
    if (this.shouldLog("debug")) {
      this.writeToStderr(this.formatMessage("DEBUG", message, metadata));
    }
  }

  info(message: string, metadata: LogMetadata = {}): void {
    if (this.shouldLog("info")) {
      this.writeToStderr(this.formatMessage("INFO", message, metadata));
    }
  }

  warn(message: string, metadata: LogMetadata = {}): void {
    if (this.shouldLog("warn")) {
      this.writeToStderr(this.formatMessage("WARN", message, metadata));
    }
  }

  error(message: string, metadata: LogMetadata = {}): void {
    if (this.shouldLog("error")) {
      this.writeToStderr(this.formatMessage("ERROR", message, metadata));
    }
  }

  setContext(context: string): void {
    this.context = context;
  }

  setMetadata(metadata: LogMetadata): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  clearMetadata(): void {
    this.metadata = {};
  }
}

// Create default logger instance
export const logger = new MCPCompatibleLogger();

// Helper function to create a child logger with a specific context
export function createContextLogger(context: string, metadata: LogMetadata = {}): MCPCompatibleLogger {
  return new MCPCompatibleLogger(context, metadata);
} 