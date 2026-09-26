# WebCraft: collaboration upgrade

## What you'll get
1. **Stronger block locking** – selecting a block locks it for you (with your name/color badge), others see it locked and can't drag, resize, or edit it. Locks auto-release when you deselect, leave, or go idle. Owners can force-unlock.
2. **Better drag and drop** – multi-select (shift-click / box select), keyboard nudging (arrows, shift = 10px), snap-to-grid toggle + grid size, alignment/distribute buttons, duplicate, bring forward/back, lock position, and live ghost previews of other people's drags.
3. **Google-Docs-style live text** – editing text directly on the page, character-by-character merging so two people typing in the same block never overwrite each other, with remote carets shown in their color.
4. **Blank pages** – a project can have many pages (add blank page, rename, reorder, delete), shown as tabs in the editor.
5. **Whiteboard page** – its own page per project, live for everyone: sticky notes, shapes, arrows/connectors, freehand pen, text, frames, plus planning tools (kanban columns, timeline, checklists, voting dots), zoom/pan, and live cursors.
6. **Team chat page** – project-wide chat for all members with @mentions (notifications badge), and "attach a change": pick an item from the activity feed to highlight in your message with your reason; clicking it jumps to that block.
7. **Activity previews** – clicking an item in the activity feed shows a small before/after preview of that change (position/size diff drawn on a mini canvas, text before vs after).

## Build order
1. Pages + activity snapshots (foundation)
2. Locking + drag/drop upgrades
3. Live text editing (CRDT)
4. Whiteboard
5. Chat with mentions and change highlights
6. Activity preview popover

## Technical details
- New tables: `pages` (project_id, kind: canvas|whiteboard, title, order), `board_items` (LWW per-prop, same as nodes), `messages` (body, mentions uuid[], activity_id ref), `message_reads`. Nodes gain `page_id`. Activity gains `before`/`after` jsonb captured in `apply_node_op`. All with GRANTs + member RLS, realtime publication.
- Text CRDT: Yjs per text block, updates broadcast on the realtime channel and persisted as merged state in a `node_text` table (bytea base64) with periodic compaction; awareness for carets.
- Locking reuses `acquire_lease`/heartbeat; enforced server-side in `apply_node_op` (already returns `blocked`), extended to multi-select and to text edits.
- Whiteboard reuses the room hook (presence, cursors, LWW ops) scoped by page id.
