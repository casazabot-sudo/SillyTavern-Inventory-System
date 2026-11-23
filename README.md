# Dynamic Relationships + Inventory Module v0.9.0

Integrated Inventory is an optional module inside Dynamic Relationships. It uses the parent extension's prompt lifecycle and does not register a separate generation interceptor.

## Toggle
- **Enable Inventory module (AI tracking)** controls whether inventory instructions are injected and whether AI inventory action blocks are processed.
- When disabled, AI inventory actions are ignored. Manual inventory management, viewing, and backup/restore remain available.
- **Auto-apply AI changes** is a separate control. When Inventory is enabled but auto-apply is off, AI action blocks are logged but not applied.

## Inventories
Each registered character has a private, single inventory. Containers/storage locations are not modeled. The extension stores inventory data locally per chat.

## AI action protocol
Assistant messages may include `<!-- INVENTORY_ACTIONS {"actions":[...]} -->` blocks. Supported action types: `create_entity`, `add`, `remove`, `consume`, `transfer`. The extension validates operations and logs outcomes.

## Diagnostics
Use the AI pipeline diagnostics section to see prompt status, parsing and database outcomes. This package has been syntax-checked and archive-checked; it has not been runtime-tested in the user's SillyTavern instance.
