# Dynamic Relationships 0.8.5 + Optional Inventory Module

This package preserves the original Dynamic Relationships 0.8.4 extension source and adds Inventory System v0.3.1 as an optional module.

## Inventory toggle
- **Enable Inventory module (AI tracking)** controls whether inventory instructions are added to the prompt and whether AI action blocks are processed. When off, its prompt key is cleared and inventory response processing is skipped.
- **Auto-apply AI changes** independently controls automatic application of inventory commands.
- Manual inventory controls, backup/restore, and chat-local storage remain available.

## Integration changes
- Inventory prompt is injected using SillyTavern `setExtensionPrompt` with its own prompt key, not a generation interceptor.
- Inventory response parsing is handled by its own `MESSAGE_RECEIVED` listener.
- Dynamic Relationships prompt, event handlers, relationship data, settings, and scene/character/thought tracking are retained from the supplied source.
- Inventory data remains in its existing IndexedDB database `SillyTavern_InventorySystem`; this package does not delete or reset it.

## Installation
1. Back up the existing Dynamic Relationships settings/chat metadata and inventory backup.
2. Disable/remove the separate Inventory System extension to avoid duplicate panels or listeners.
3. Replace Dynamic Relationships extension files with this package.
4. Reload SillyTavern.
5. Test generation with Inventory disabled first, then enabled.

This build has been syntax-checked and ZIP integrity-checked only. Runtime testing in SillyTavern has not been performed.
