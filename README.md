# Inventory System for SillyTavern

**Version:** 0.1.0 (prototype)  
**Storage:** Browser IndexedDB, separate chat key  
**Server plugin:** Not required

Inventory System is a client-side SillyTavern UI extension prototype. It keeps inventory data outside chat messages and Lorebooks, in a browser IndexedDB database.

## Features in v0.1.0

- Separate inventory data keyed to the active chat.
- Initializes `{{user}}` and the current character entity on a chat.
- Create NPCs and other entities.
- Create bags, backpacks, containers, spatial rings and spatial pockets.
- Add items with quantity, description, owner and storage.
- Move items between owners/containers manually.
- Delete entries.
- Event log (recent 100 events).
- Export/import JSON backup.
- Inject current registered inventory state into the generation prompt.
- No server plugin, SQLite, Node packages or config.yaml changes.

## Install from GitHub in SillyTavern

1. Install Git if your SillyTavern setup does not already have it.
2. Open SillyTavern → **Extensions** → **Install Extension**.
3. Paste this repository URL (replace with the actual repository after publishing):
   `https://github.com/casazabot-sudo/InventorySystem`
4. Choose the installation target and install.
5. Refresh/restart SillyTavern if prompted, then enable Inventory System in Extensions.

## Use

1. Open a chat. The database initializes and creates `{{user}}` plus the current character.
2. Expand the Inventory System panel in Extensions.
3. Add NPCs/entities, containers, and items.
4. Use item Move selectors to change owner or storage.
5. Export backups regularly. Data is stored in this browser's IndexedDB and does not automatically sync between browsers or devices.

## Backup and restore

- **Export backup** downloads a JSON snapshot for the active chat.
- **Import backup** merges the records from a JSON snapshot into the currently open chat database.

## Limitations / known prototype issues

- AI prose does not automatically modify the database yet. Prompt injection supplies the current state and instructs the model not to assume unregistered items, but persistence currently requires UI actions.
- The UI and data schema are prototype quality and require testing against the current SillyTavern release.
- Browser storage may be cleared by browser cleanup or profile removal. Keep exported backups.
- The active-chat identifier depends on SillyTavern context fields. Verify that chat switching isolates data in your environment before relying on it.
- The prompt interceptor appends a system-style message to the prompt chat array; verify behavior with the prompt format/backend you use.
- No capacity/weight, equipment slots, nested containers, undo, transaction validation, or automatic item extraction yet.

## Privacy

Inventory records are stored locally in the browser profile's IndexedDB. The extension does not send inventory data to a third-party service.

## License

GNU Affero General Public License v3.0 (AGPL-3.0). See `LICENSE`.
