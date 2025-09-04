# Index Lifecycle Management (ILM) Tools

This folder contains all the Index Lifecycle Management tools for Elasticsearch. These tools allow you to manage the lifecycle of indices through various phases like hot, warm, cold, and delete.

## Available Tools

### Lifecycle Policy Management
- **`ilm_get_lifecycle`** - Get lifecycle policies
- **`ilm_put_lifecycle`** - Create or update a lifecycle policy *(Write Operation)*
- **`ilm_delete_lifecycle`** - Delete a lifecycle policy *(Destructive Operation)*

### Index Lifecycle Control
- **`ilm_explain_lifecycle`** - Explain the lifecycle state of indices
- **`ilm_remove_policy`** - Remove lifecycle policies from indices *(Write Operation)*
- **`ilm_retry`** - Retry failed lifecycle steps *(Write Operation)*
- **`ilm_move_to_step`** - Manually move an index to a specific lifecycle step *(Destructive Operation)*

### ILM System Management
- **`ilm_get_status`** - Get the current ILM status
- **`ilm_start`** - Start the ILM plugin *(Write Operation)*
- **`ilm_stop`** - Stop the ILM plugin *(Write Operation)*

### Migration Tools
- **`ilm_migrate_to_data_tiers`** - Migrate from node attributes to data tiers *(Destructive Operation)*

## Read-Only Mode Support

All ILM tools respect the read-only mode configuration:

- **Read Operations**: `ilm_get_lifecycle`, `ilm_explain_lifecycle`, `ilm_get_status` - Always allowed
- **Write Operations**: `ilm_put_lifecycle`, `ilm_remove_policy`, `ilm_retry`, `ilm_start`, `ilm_stop` - Blocked/warned in read-only mode
- **Destructive Operations**: `ilm_delete_lifecycle`, `ilm_move_to_step`, `ilm_migrate_to_data_tiers` - Blocked/warned in read-only mode

## Tool Naming Convention

All ILM tools follow the naming convention `ilm_[operation]` to clearly identify them as Index Lifecycle Management tools and avoid conflicts with other Elasticsearch APIs.

## Important Notes

- **`ilm_move_to_step`** is particularly dangerous as it can result in data loss. It should only be used by experts.
- **`ilm_migrate_to_data_tiers`** requires ILM to be stopped before execution.
- All destructive operations include appropriate warnings and are subject to read-only mode restrictions.

## File Structure

```
src/tools/ilm/
├── index.ts                    # Exports all ILM tools
├── delete_lifecycle.ts         # Delete lifecycle policies
├── explain_lifecycle.ts        # Explain lifecycle states
├── get_lifecycle.ts            # Get lifecycle policies
├── get_status.ts              # Get ILM status
├── migrate_to_data_tiers.ts   # Migration utilities
├── move_to_step.ts            # Manual step control
├── put_lifecycle.ts           # Create/update policies
├── remove_policy.ts           # Remove policies from indices
├── retry.ts                   # Retry failed steps
├── start.ts                   # Start ILM plugin
└── stop.ts                    # Stop ILM plugin
```

Each tool follows the established patterns for error handling, logging, parameter validation, and read-only mode compliance.
