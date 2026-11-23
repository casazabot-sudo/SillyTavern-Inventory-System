# Inventory System for SillyTavern

**Version:** 0.2.0 (experimental)  
**Storage:** Browser IndexedDB, separate per chat  
**Server plugin:** Not required

## What's new in v0.2
- Reads a hidden `INVENTORY_ACTIONS` comment from assistant responses.
- Supports `add`, `remove`, `consume`, `transfer`, `move`, and `create_storage` action types.
- Validates entity/storage references and quantity availability before applying the action batch.
- Stores processed message keys to reduce duplicate processing.
- Toggle for AI auto-apply (on by default).
- Preserves v0.1 IndexedDB records; schema upgrade adds processed-message tracking.

## Install/update
GitHub repository: (https://github.com/casazabot-sudo/SillyTavern-Inventory-System)
Update through SillyTavern's extension manager or pull/update the repository, then refresh ST. Existing IndexedDB data is retained.

## AI action block format
When an inventory change has actually occurred in the story, the assistant should append one hidden HTML comment containing JSON. Example:

```html
<!-- INVENTORY_ACTIONS {"actions":[{"type":"add","item":"Example item","quantity":1,"owner":"user","storage":"","description":""}]} -->
```

Supported actions:
- `add`: create item record. Fields: `item`, `quantity`, optional `owner`, `storage`, `description`.
- `remove`: remove item quantity. Fields: `item`, `quantity`, optional `owner`, `storage`.
- `consume`: decrement/remove quantity. Same selectors as `remove`.
- `transfer`: change item owner. Fields: `item`, `quantity`, optional `owner`, `storage`, required `toOwner`.
- `move`: change storage location. Fields: `item`, `quantity`, optional `owner`, `storage`, required `toStorage` (empty string = carried).
- `create_storage`: create a storage. Fields: `name`, optional `storageType`, `owner`, `description`.

Owner and storage references must match IDs provided in the prompt. Up to 20 actions are accepted in one block. Only completed story actions should be emitted; mentions, plans, and hypotheticals should not modify inventory.

## Safety and data reliability
AI auto-apply is experimental. Disable the toggle for manual-only mode. Disabled actions are skipped (no review queue in this release). Keep JSON backups. Action blocks can be malformed or model-inaccurate. Validation preflights the batch, but database writes are sequential rather than a single atomic transaction; a failure during writes can cause a partial batch. Review the activity list after testing.

## Known limitations
- Prompt protocol reliability varies by model and prompt style.
- Swipes/edits are not reconciled automatically yet.
- No confirmation/review queue or rollback button.
- No item stack merging, weight/capacity, nested containers, equipment slots, or advanced filtering.
- Data is browser-local IndexedDB and does not sync across devices.
- Chat key is based on the current ST context chat filename and character name; test chat isolation in your environment.
- Current prompt interceptor injects an ephemeral context message. Test compatibility with your preset/model.

## Backups
Use the panel's Backup button to export JSON for the current chat. Restore merges records into the current chat; export a fresh backup before restore if you need a rollback point.

## License
AGPL-3.0.

## Suggested smoke test after update
1. Update extension and reload SillyTavern.
2. Open two different chats and add a harmless test item in only one. Confirm chat isolation.
3. In one chat, add a test entity and storage, then register a few test items.
4. Enable auto-apply, ask the model to narrate a simple explicit acquisition/transfer/storage change using those registered names.
5. Check the activity list and quantities, then regenerate/swipe and confirm duplicate events do not repeatedly apply the same block.
6. Disable auto-apply and confirm AI action blocks are skipped; manual UI operations should still work.
7. Export backup, then restore into a test chat and confirm records appear there. Note: import merges records; do not restore over valuable data without a backup.
