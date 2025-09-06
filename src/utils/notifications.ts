/* src/utils/notifications.ts */

import type { RequestHandlerExtra, ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { getCurrentRunTree, withRunTree } from "langsmith/singletons/traceable";
import { logger } from "./logger.js";

/**
 * Progress notification interface
 */
export interface ProgressNotification {
  progressToken: string | number;
  progress: number;
  total?: number;
}

/**
 * General notification levels
 */
export type NotificationLevel = "info" | "warning" | "error" | "debug";

/**
 * General notification interface
 */
export interface GeneralNotification {
  level: NotificationLevel;
  logger?: string;
  data: {
    message: string;
    timestamp?: string;
    operation_id?: string;
    type?: string;
    [key: string]: any;
  };
}

/**
 * Enhanced notification manager for MCP server
 * Uses RequestHandlerExtra context for proper MCP notifications
 */
export class NotificationManager {
  private requestContext: RequestHandlerExtra<ServerRequest, ServerNotification> | null = null;
  private activeOperations: Map<string, { 
    progressToken: string | number; 
    total?: number; 
    lastProgress: number 
  }> = new Map();

  constructor() {
    // No server needed - we use the request context
  }

  /**
   * Set the request context from a tool handler
   * This provides access to sendNotification function
   */
  setRequestContext(context: RequestHandlerExtra<ServerRequest, ServerNotification>): void {
    this.requestContext = context;
    logger.debug("Notification manager request context set");
  }

  /**
   * Clear the request context after tool execution
   */
  clearRequestContext(): void {
    this.requestContext = null;
    logger.debug("Notification manager request context cleared");
  }

  /**
   * Send a progress notification with trace context preservation
   */
  async sendProgress(notification: ProgressNotification): Promise<void> {
    if (!this.requestContext?.sendNotification) {
      logger.debug("No request context available for progress notification", notification);
      return;
    }

    // CRITICAL: Safely get trace context without throwing errors
    let currentTrace;
    try {
      currentTrace = getCurrentRunTree(true); // Allow absent run tree
    } catch (error) {
      // No tracing context available - this is fine
      currentTrace = null;
    }
    
    const sendNotificationSafely = async () => {
      try {
        // Use the sendNotification function from RequestHandlerExtra
        await this.requestContext!.sendNotification({
          method: "notifications/progress",
          params: {
            progressToken: notification.progressToken,
            progress: notification.progress,
            total: notification.total,
          },
        });

        logger.debug("Progress notification sent", {
          token: notification.progressToken,
          progress: notification.progress,
          total: notification.total,
          hasTraceContext: !!currentTrace,
        });
      } catch (error) {
        logger.error("Failed to send progress notification", {
          error: error instanceof Error ? error.message : String(error),
          notification,
          hasTraceContext: !!currentTrace,
        });
      }
    };

    // Execute with preserved trace context if available
    if (currentTrace) {
      await withRunTree(currentTrace, sendNotificationSafely);
    } else {
      await sendNotificationSafely();
    }
  }

  /**
   * Send a general notification with trace context preservation
   */
  async sendMessage(notification: GeneralNotification): Promise<void> {
    if (!this.requestContext?.sendNotification) {
      logger.debug("No request context available for message notification", notification);
      return;
    }

    // CRITICAL: Safely get trace context without throwing errors
    let currentTrace;
    try {
      currentTrace = getCurrentRunTree(true); // Allow absent run tree
    } catch (error) {
      // No tracing context available - this is fine
      currentTrace = null;
    }
    
    const sendNotificationSafely = async () => {
      try {
        // Use the sendNotification function for logging messages
        await this.requestContext!.sendNotification({
          method: "notifications/message",
          params: {
            level: notification.level,
            logger: notification.logger || "elasticsearch-mcp-server",
            data: {
              ...notification.data,
              timestamp: notification.data.timestamp || new Date().toISOString(),
            },
          },
        });

        logger.debug("Message notification sent", {
          level: notification.level,
          message: notification.data.message,
          type: notification.data.type,
          hasTraceContext: !!currentTrace,
        });
      } catch (error) {
        logger.error("Failed to send message notification", {
          error: error instanceof Error ? error.message : String(error),
          notification,
          hasTraceContext: !!currentTrace,
        });
      }
    };

    // Execute with preserved trace context if available
    if (currentTrace) {
      await withRunTree(currentTrace, sendNotificationSafely);
    } else {
      await sendNotificationSafely();
    }
  }

  /**
   * Start tracking a long-running operation with progress
   */
  async startOperation(
    operationId: string,
    progressToken: string | number,
    total?: number,
    description?: string
  ): Promise<void> {
    this.activeOperations.set(operationId, {
      progressToken,
      total,
      lastProgress: 0,
    });

    // Send initial progress
    await this.sendProgress({
      progressToken,
      progress: 0,
      total,
    });

    // Send operation start notification
    await this.sendMessage({
      level: "info",
      data: {
        type: "operation_started",
        operation_id: operationId,
        message: description || `Operation ${operationId} started`,
      },
    });

    logger.info("Operation started with progress tracking", {
      operationId,
      progressToken,
      total,
      description,
    });
  }

  /**
   * Update progress for an active operation
   */
  async updateProgress(
    operationId: string,
    progress: number,
    message?: string
  ): Promise<void> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn("Attempted to update progress for unknown operation", { operationId });
      return;
    }

    // Update progress
    operation.lastProgress = progress;
    await this.sendProgress({
      progressToken: operation.progressToken,
      progress,
      total: operation.total,
    });

    // Send step notification if message provided
    if (message) {
      await this.sendMessage({
        level: "info",
        data: {
          type: "operation_progress",
          operation_id: operationId,
          message,
          progress,
          total: operation.total,
        },
      });
    }

    logger.debug("Operation progress updated", {
      operationId,
      progress,
      total: operation.total,
      message,
    });
  }

  /**
   * Complete a long-running operation
   */
  async completeOperation(
    operationId: string,
    result?: any,
    message?: string
  ): Promise<void> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn("Attempted to complete unknown operation", { operationId });
      return;
    }

    // Send final progress
    await this.sendProgress({
      progressToken: operation.progressToken,
      progress: operation.total || 100,
      total: operation.total,
    });

    // Send completion notification
    await this.sendMessage({
      level: "info",
      data: {
        type: "operation_completed",
        operation_id: operationId,
        message: message || `Operation ${operationId} completed successfully`,
        result: result ? String(result) : undefined,
      },
    });

    // Clean up
    this.activeOperations.delete(operationId);

    logger.info("Operation completed", {
      operationId,
      result,
      message,
    });
  }

  /**
   * Fail a long-running operation
   */
  async failOperation(
    operationId: string,
    error: Error | string,
    message?: string
  ): Promise<void> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn("Attempted to fail unknown operation", { operationId });
      return;
    }

    // Send error notification
    await this.sendMessage({
      level: "error",
      data: {
        type: "operation_failed",
        operation_id: operationId,
        message: message || `Operation ${operationId} failed`,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    // Clean up
    this.activeOperations.delete(operationId);

    logger.error("Operation failed", {
      operationId,
      error: error instanceof Error ? error.message : String(error),
      message,
    });
  }

  /**
   * Send a warning notification
   */
  async sendWarning(message: string, data?: Record<string, any>): Promise<void> {
    await this.sendMessage({
      level: "warning",
      data: {
        message,
        type: "warning",
        ...data,
      },
    });
  }

  /**
   * Send an error notification
   */
  async sendError(message: string, error?: Error | string, data?: Record<string, any>): Promise<void> {
    await this.sendMessage({
      level: "error",
      data: {
        message,
        type: "error",
        error: error instanceof Error ? error.message : error,
        ...data,
      },
    });
  }

  /**
   * Send an info notification
   */
  async sendInfo(message: string, data?: Record<string, any>): Promise<void> {
    await this.sendMessage({
      level: "info",
      data: {
        message,
        type: "info",
        ...data,
      },
    });
  }

  /**
   * Get active operation count
   */
  getActiveOperationsCount(): number {
    return this.activeOperations.size;
  }

  /**
   * Get active operation IDs
   */
  getActiveOperationIds(): string[] {
    return Array.from(this.activeOperations.keys());
  }

  /**
   * Generate a unique operation ID
   */
  static generateOperationId(prefix: string = "op"): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Generate a progress token from operation ID
   */
  static generateProgressToken(operationId: string): string {
    return `progress-${operationId}`;
  }
}

// Global notification manager instance
export const notificationManager = new NotificationManager();

/**
 * Helper to wrap tool handlers with notification context
 */
export function withNotificationContext<TArgs, TResult>(
  handler: (args: TArgs, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => Promise<TResult>
): (args: TArgs, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => Promise<TResult> {
  return async (args: TArgs, extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<TResult> => {
    // Set the request context so notifications can be sent
    notificationManager.setRequestContext(extra);
    
    try {
      const result = await handler(args, extra);
      return result;
    } finally {
      // Always clear the context after execution
      notificationManager.clearRequestContext();
    }
  };
}

/**
 * Helper function to wrap a tool handler with notification support
 */
export function withNotifications<T extends any[], R>(
  toolName: string,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const operationId = NotificationManager.generateOperationId(toolName);
    const progressToken = NotificationManager.generateProgressToken(operationId);

    try {
      // For long-running operations, we could start progress tracking here
      // But for now, just execute and notify on errors
      const result = await handler(...args);
      
      return result;
    } catch (error) {
      // Send error notification for failed operations
      await notificationManager.sendError(
        `Tool ${toolName} execution failed`,
        error instanceof Error ? error : new Error(String(error)),
        { tool: toolName, operation_id: operationId }
      );
      throw error;
    }
  };
}

/**
 * Helper for operations that need progress tracking
 */
export interface ProgressTracker {
  operationId: string;
  progressToken: string;
  updateProgress: (progress: number, message?: string) => Promise<void>;
  complete: (result?: any, message?: string) => Promise<void>;
  fail: (error: Error | string, message?: string) => Promise<void>;
}

/**
 * Create a progress tracker for long-running operations
 */
export async function createProgressTracker(
  toolName: string,
  total?: number,
  description?: string
): Promise<ProgressTracker> {
  const operationId = NotificationManager.generateOperationId(toolName);
  const progressToken = NotificationManager.generateProgressToken(operationId);

  await notificationManager.startOperation(operationId, progressToken, total, description);

  return {
    operationId,
    progressToken,
    updateProgress: (progress: number, message?: string) =>
      notificationManager.updateProgress(operationId, progress, message),
    complete: (result?: any, message?: string) =>
      notificationManager.completeOperation(operationId, result, message),
    fail: (error: Error | string, message?: string) =>
      notificationManager.failOperation(operationId, error, message),
  };
}