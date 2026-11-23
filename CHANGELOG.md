# Changelog

## 0.2.3
- Fixed prompt injection: interceptor now mutates the provided prompt chat array directly, as SillyTavern expects, and tags the temporary note for cleanup after generation.
- Added plain-text `INVENTORY_ACTIONS:` JSON fallback in addition to HTML-comment blocks, with balanced-brace parsing for nested action objects.
- Added interceptor/response/parser/database diagnostics in the extension panel, including an explicit prompt-injected stage.
- Added retry window for MESSAGE_RECEIVED timing races and focused scanning of recent assistant messages.
- Improved instructions for action blocks and same-response temporary storage aliases.
- Bumped UI and manifest version.

## 0.2.2
- Improved AI action detection by checking recent assistant messages when message events arrive out of order or with incomplete payloads.
- Added explicit AI log entries for skipped/empty action blocks and more informative AI status text.
- Added temporary storage aliases to create a container and add items to it within one action block.
- Storage creation now verifies by the exact newly created storage ID, avoiding ambiguous name matches.
- Added a Storage contents view that groups items inside each container, including spatial rings.
- Expanded activity log to show up to 60 events with AI operation numbers and status labels.
- Updated UI version label and README test checklist.


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

## 0.2.4
- Added AI action `create_entity` for auto-registering NPCs and newly introduced characters.
- Added entity aliases for same-message item/storage ownership operations.
- Prompt instructs registration on first active-scene appearance and avoids duplicates.
- Existing User and main Character remain initialized automatically.
