# Changelog

## 0.2.1
- Added per-operation success/error records with readable details.
- Added post-write database verification before reporting successful actions.
- Added status notifications for rejected, disabled, duplicate, and failed actions.
- Removed item inventory contents from the generation prompt to improve owner privacy.
- Added privacy instructions: characters only know inventories they learned about in-story.
- Mark partial batches as processed to avoid replaying successful earlier operations.
- Updated repository URL.

## 0.2.0
- AI action block support, validation, preflight checks, duplicate processing guard.
- Auto-apply setting and backup/restore.

## 0.1.0
- Initial inventory UI and per-chat IndexedDB.
