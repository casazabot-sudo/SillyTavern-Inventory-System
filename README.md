# SillyTavern Inventory System

A chat-local fantasy roleplay inventory extension for SillyTavern.

## v0.3.0

### Design
- One inventory per registered character: user, main character, and NPCs.
- `{{user}}` and the current main character are initialized automatically.
- AI is instructed to register a newly introduced active-scene NPC with `create_entity` and use `INVENTORY_ACTIONS` for completed item changes.
- Inventories are private; item lists are deliberately not sent in the prompt.
- No tracked rings, bags, pockets, chests, or nested containers. Such legacy items are flattened into owner inventories during migration.

### AI action protocol
At the end of an assistant reply, the extension parses a hidden HTML-comment block or a plain marker fallback:

```text
<!-- INVENTORY_ACTIONS {"actions":[
  {"type":"create_entity","name":"Elara","kind":"npc","alias":"elara"},
  {"type":"add","item":"Notebook","quantity":1,"owner":"elara"}
]} -->
```

Supported actions: `create_entity`, `add`, `remove`, `consume`, `transfer`. AI actions are subject to validation and duplicate-message protection. Auto-apply can be toggled in the panel.

### Install / update
1. Back up the inventory using the extension panel.
2. Replace the installed extension files with this release's files.
3. Reload SillyTavern.
4. Open the inventory panel in each chat to run its v3 migration.

The database is local and chat-specific. Legacy storage rows remain in the database for backup compatibility, but are no longer part of the UI or new item operations. Items formerly inside a container are moved to the owning character's single inventory. If the item had no owner, the old container's owner is used when available.

## Diagnostics and limitations
The source has been syntax-checked and the archive validated. This release has not been runtime-tested in SillyTavern. NPC auto-registration still relies on the model emitting the requested structured action block; the extension logs parser/AI pipeline status so failures can be diagnosed.
