/* src/utils/readOnlyMode.ts */

import { logger } from './logger.js';
import { SearchResult, TextContent } from '../tools/types.js';

export interface ReadOnlyCheckResult {
  allowed: boolean;
  warning?: string;
  error?: string;
}

export enum OperationType {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  BULK = 'bulk',
  INDEX_MANAGEMENT = 'index_management',
  DESTRUCTIVE = 'destructive'
}

// Define which tools are destructive/write operations
export const DESTRUCTIVE_TOOLS = new Set([
  'delete_document',
  'update_document', 
  'index_document',
  'delete_index',
  'create_index',
  'update_index_settings',
  'put_mapping',
  'bulk_operations',
  'delete_by_query',
  'update_by_query',
  'reindex_documents',
  'delete_alias',
  'put_alias',
  'update_aliases',
  'put_index_template',
  'delete_index_template',
  'refresh_index',
  'flush_index',
  // ILM destructive operations
  'ilm_delete_lifecycle',
  'ilm_move_to_step',
  'ilm_migrate_to_data_tiers'
]);

export const WRITE_TOOLS = new Set([
  'index_document',
  'update_document',
  'bulk_operations',
  'update_by_query',
  'put_alias',
  'update_aliases',
  'put_index_template',
  'create_index',
  'put_mapping',
  'update_index_settings',
  'reindex_documents',
  // ILM write operations
  'ilm_put_lifecycle',
  'ilm_remove_policy',
  'ilm_retry',
  'ilm_start',
  'ilm_stop'
]);

export const DELETE_TOOLS = new Set([
  'delete_document',
  'delete_index',
  'delete_by_query',
  'delete_alias',
  'delete_index_template',
  // ILM delete operations
  'ilm_delete_lifecycle'
]);

export class ReadOnlyModeManager {
  private readOnlyMode: boolean;
  private strictMode: boolean; // true = block, false = warn

  constructor(readOnlyMode: boolean = false, strictMode: boolean = true) {
    this.readOnlyMode = readOnlyMode;
    this.strictMode = strictMode;
    
    if (this.readOnlyMode) {
      logger.info('Read-only mode enabled', { 
        strictMode: this.strictMode,
        message: this.strictMode ? 'Destructive operations will be blocked' : 'Destructive operations will show warnings'
      });
    }
  }

  checkOperation(toolName: string, operationType?: OperationType): ReadOnlyCheckResult {
    if (!this.readOnlyMode) {
      return { allowed: true };
    }

    const isDestructive = DESTRUCTIVE_TOOLS.has(toolName);
    const isWrite = WRITE_TOOLS.has(toolName);
    const isDelete = DELETE_TOOLS.has(toolName);

    if (!isDestructive && !isWrite && !isDelete) {
      return { allowed: true };
    }

    const operationTypeStr = this.getOperationTypeString(toolName, isDelete, isWrite, isDestructive);
    
    if (this.strictMode) {
      const error = `🚫 READ-ONLY MODE: ${operationTypeStr} operation '${toolName}' is blocked. Set READ_ONLY_MODE=false to enable write operations.`;
      logger.warn('Blocked destructive operation in read-only mode', { 
        toolName, 
        operationType: operationTypeStr,
        strictMode: true 
      });
      return { 
        allowed: false, 
        error 
      };
    } else {
      const warning = `⚠️ CAUTION: You are about to perform a ${operationTypeStr} operation '${toolName}'. This may modify or delete data in Elasticsearch. Proceed with caution.`;
      logger.warn('Warning for destructive operation', { 
        toolName, 
        operationType: operationTypeStr,
        strictMode: false 
      });
      return { 
        allowed: true, 
        warning 
      };
    }
  }

  private getOperationTypeString(toolName: string, isDelete: boolean, isWrite: boolean, isDestructive: boolean): string {
    if (isDelete) return 'DESTRUCTIVE DELETE';
    if (isWrite && isDestructive) return 'WRITE/MODIFY';
    if (isWrite) return 'WRITE';
    if (isDestructive) return 'DESTRUCTIVE';
    return 'UNKNOWN';
  }

  isReadOnlyMode(): boolean {
    return this.readOnlyMode;
  }

  isStrictMode(): boolean {
    return this.strictMode;
  }

  setStrictMode(strict: boolean): void {
    this.strictMode = strict;
    logger.info('Read-only mode strictness changed', { strictMode: strict });
  }

  // Helper method to create standardized error responses
  createBlockedResponse(toolName: string): SearchResult {
    const check = this.checkOperation(toolName);
    return {
      content: [{
        type: "text",
        text: check.error || `Operation ${toolName} is blocked in read-only mode.`
      } as TextContent]
    };
  }

  // Helper method to create warning responses
  createWarningResponse(toolName: string, originalResponse: SearchResult): SearchResult {
    const check = this.checkOperation(toolName);
    const content = Array.isArray(originalResponse.content) ? [...originalResponse.content] : [originalResponse.content];
    
    if (check.warning) {
      content.unshift({
        type: "text",
        text: check.warning
      } as TextContent);
    }
    
    return { content };
  }
}

// Export a default instance - will be configured in server.ts
export let readOnlyManager: ReadOnlyModeManager;

export function initializeReadOnlyManager(readOnlyMode: boolean, strictMode: boolean = true): void {
  readOnlyManager = new ReadOnlyModeManager(readOnlyMode, strictMode);
}

// Decorator function for tools
export function withReadOnlyCheck<T extends any[], R>(
  toolName: string,
  toolFunction: (...args: T) => Promise<R>,
  operationType?: OperationType
) {
  return async (...args: T): Promise<R> => {
    const check = readOnlyManager.checkOperation(toolName, operationType);
    
    if (!check.allowed) {
      return readOnlyManager.createBlockedResponse(toolName) as R;
    }
    
    const result = await toolFunction(...args);
    
    if (check.warning) {
      return readOnlyManager.createWarningResponse(toolName, result) as R;
    }
    
    return result;
  };
}
