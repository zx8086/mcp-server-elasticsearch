/* src/tools/notifications/index.ts */

import { registerBulkIndexWithProgress } from "../bulk/bulk_index_with_progress.js";
import { registerReindexWithNotifications } from "../index_management/reindex_with_notifications.js";

import type { ToolRegistrationFunction } from "../types.js";

/**
 * Tools that demonstrate notification and progress capabilities
 */
export const notificationTools: ToolRegistrationFunction[] = [
  registerBulkIndexWithProgress,
  registerReindexWithNotifications,
];
