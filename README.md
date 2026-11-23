# Inventory System for SillyTavern

**Version:** 0.2.1 (experimental)  
**Storage:** Browser IndexedDB, separate per chat  
**Server plugin:** Not required

## What's new in v0.2.1
- Action results are logged individually with success/error status, item, quantity, owner and location details.
- Successful operations are checked against the database before being marked verified.
- Clear status text and notifications for applied, failed, disabled, duplicate, and rejected action blocks.
- The AI prompt no longer receives item lists from any owner. Inventories are private to each owner; characters must not know or reveal another entity's inventory unless it was learned in the story.
- Failed/partial batches are recorded to prevent reapplying already executed operations on duplicate message events.
- Uses the corrected repository URL: https://github.com/casazabot-sudo/SillyTavern-Inventory-System

## Install/update
Update the extension through SillyTavern's extension manager or pull the repository files, then reload ST. The IndexedDB database name is unchanged; the existing records should remain. The v0.2.1 release has not yet been runtime-tested in your SillyTavern installation.

## AI action comment format
When a completed inventory change occurs, the assistant appends a hidden comment:

```html
<!-- INVENTORY_ACTIONS {"actions":[{"type":"add","item":"Example item","quantity":1,"owner":"user","storage":"","description":""}]} -->
```

Actions: `add`, `remove`, `consume`, `transfer`, `move`, `create_storage`. Owner and storage fields use IDs supplied by the extension; an empty storage string means carried/no container. Up to 20 actions per block.

## Privacy design
The prompt contains entity names/IDs and storage metadata, but **does not include item lists or item descriptions**. All inventory contents are treated as private. Story characters should only know inventory contents that they have personally observed, been told about, or received through an explicit in-story event. The extension itself stores the inventory state for bookkeeping and validation.

This is prompt-level narrative privacy, not a hard security boundary: the language model may still make mistakes, and the extension cannot enforce what a model narrates.

## Reliability notes
Action batches are preflighted before writes, but operations still use sequential IndexedDB writes and are not transactional as a whole. If a failure occurs after some operations, the log will show a partial batch and duplicate-message processing is blocked for that message. Export backups regularly.

## Test checklist
1. Update/reload and confirm version 0.2.1.
2. Register separate test owners and items manually.
3. Ask for a simple in-story add/consume/move/transfer and inspect the Activity log. It should show success only after verification.
4. Ask for an invalid removal quantity; expect an error with available/requested amounts and no batch writes.
5. Confirm the prompt does not list item names/quantities for any owner.
6. Disable auto-apply and confirm the status says no changes were applied.
7. Export a backup before testing on valuable chats.

## License
AGPL-3.0
