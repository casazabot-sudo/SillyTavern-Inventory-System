# Changelog

## 0.3.1
- Fixes generation-interceptor return contract: always returns the mutated chat array.
- Makes prompt injection synchronous and removes IndexedDB reads/migrations from the generation-interceptor path.
- Uses static inventory instructions only; inventory contents remain private and are not sent to prompts.
- Keeps prompt-note cleanup on generation-ended/stopped events.

## 0.3.0
- Replaced separate containers/storage UI with a single inventory per character.
- Automatically initializes `{{user}}` and the current main character when a chat is opened.
- Added prompt protocol for AI-created NPC registry entries (`create_entity`) and inventory changes.
- Items are shown grouped by owner; inventory lists remain private and are not injected into the prompt.
- Migrates existing items out of rings/bags/containers into each item's owner inventory (uses container owner when item owner was blank).
- Keeps old storage records in the local DB for backup/history compatibility; no longer exposes or uses them in new operations.
- Manual item creation remains; manual entity/container creation removed.
- Database schema marker upgraded to v3; old chat data is preserved.

## 0.2.x
See prior releases and repository history.
