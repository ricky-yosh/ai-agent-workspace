# Tickets: Canvas Overhaul

Adopts `@xyflow/react` as the Visual Canvas engine, enriches the node data model, and replaces custom canvas rendering and context menus with the app's established modal and library patterns. See [spec.md](spec.md).

Work the **frontier**: any ticket whose blockers are all done.

---

## 1. Schema migration + backend extensions

**What to build:** Extend the data model and wire the missing Tauri commands. After this ticket, the backend supports nodes with `title`, `description`, and attached `sources` (file paths or web links). `create_canvas_edge` and `create_canvas_group` work through Tauri IPC.

**Blocked by:** None — can start immediately.

- [ ] `canvas_nodes.content` renamed to `canvas_nodes.title`; `description TEXT` column added with DB migration
- [ ] New `canvas_node_sources` table created (id, node_id FK, url, source_type CHECK, sort_order, created_at) with ON DELETE CASCADE
- [ ] `CanvasNodeSource` domain struct, repository, command variants, executor handlers, CDC event (`CanvasNodeSourcesChanged`), and Tauri commands implemented
- [ ] MCP tools `node_source_add`, `node_source_list`, `node_source_remove` registered
- [ ] Existing `node_create` and `node_update` commands accept `title`/`description` params; `content` maps to `title` for backward compatibility
- [ ] `create_canvas_edge` and `create_canvas_group` registered as Tauri IPC commands
- [ ] All Rust unit tests pass for the new/changed repositories

---

## 2. xyflow scaffolding + sync layer + basic nodes + theme

**What to build:** Mount xyflow inside the Visual Canvas Panel with a two-way sync hook. After this ticket, canvas nodes load from the backend, render as HTML divs using the app's design tokens, are draggable, and positions persist. The CursorFollower is gone.

**Blocked by:** Schema migration + backend extensions

- [ ] xyflow `<ReactFlow>` mounted in the canvas panel, replacing the current custom renderer
- [ ] Sync hook (`useCanvasSync`) subscribes to xyflow's `onNodesChange` / `onNodesDragStop` → maps to backend commands via `safeInvoke` → tracks a pending-set of locally-dirty entity IDs
- [ ] On CDC events (`canvas-nodes-changed`, etc.), sync hook re-fetches and reconciles into xyflow, skipping pending-set entities
- [ ] CSS mapping of `--xy-*` variables to app design tokens (`--bg-primary`, `--text-primary`, `--accent`, `--border`, etc.); respects theme changes automatically
- [ ] Custom Node component renders title and xyflow handles; responsive to selection and drag
- [ ] `CursorFollower.tsx` deleted
- [ ] User can see nodes loaded from the database, drag them, and positions persist across canvas reloads

---

## 3. Edge creation + verlet drag rope + visual feedback

**What to build:** Edge creation by dragging from a node's side handle to another node, with rich visual feedback. After this ticket, users can connect nodes visually, edges render as smooth-step paths, and the drag interaction feels polished.

**Blocked by:** xyflow scaffolding + sync layer + basic nodes + theme

- [ ] Custom Handle component with bob animation (hidden by default, bobbing on node hover, still when connected; 4 side-specific keyframe variants, 1.8s loop, with invisible hit-area extension)
- [ ] `connectionLineComponent` renders verlet drag rope during drag (20 particles, gravity 1500px/s², damping 0.93, fixed 1/120s timestep); claw morph (22° splay, tightens to 12° near target, clamps to -5° on release)
- [ ] Source node violet glow ring during drag; target node capture pulse on brush hover; green confirmation ring on edge commit
- [ ] `onConnect` callback maps xyflow connection to `create_canvas_edge` backend command with auto-computed source/target sides
- [ ] Custom Edge component renders settled edges using xyflow's `getSmoothStepPath` (smooth-step orthogonal with rounded corners)
- [ ] All edge animations respect `:root[data-motion="full"]` — degrade to static path when absent
- [ ] User can drag from one node's handle to another, see the rope preview, and a smooth-step edge appears and persists

---

## 4. Rich node chrome + node modal + edge modal

**What to build:** Nodes display richer summary information (tags, description snippet, source count). Double-clicking a node or edge opens a read-only modal that can toggle into edit mode, following the `NewWorkspaceModal` pattern. "Add Tag" is wired.

**Blocked by:** xyflow scaffolding + sync layer + basic nodes + theme

- [ ] Custom Node component: title (prominent), tag pills, description snippet (first ~80 chars, truncated, dimmed), source count badge (e.g. "3 sources"); tags and badge hidden when empty
- [ ] Node modal (`⌘E` or double-click): read-only view shows title, description, sources list, tags; edit button toggles to edit mode (fields become editable); done saves and returns to read-only; follows `NewWorkspaceModal`'s local `editing` boolean + header toggle button + keyboard shortcut pattern
- [ ] Node modal source management: add/remove/reorder file paths and web links per source
- [ ] Node modal tag management: add/remove tags via the modal's edit mode
- [ ] Edge modal (double-click): read-only → edit toggle with label and metadata fields
- [ ] All modals use existing `Dialog`/`Button`/`Input` primitives; keyboard hints footer; respect `data-motion`
- [ ] User can review full node info, add sources and tags, edit in place, and changes persist

---

## 5. Groups

**What to build:** Group nodes render as dashed rectangles containing member nodes. Nodes drag-in to join a group, drag-out to leave. Groups auto-expand when a child is dragged beyond their bounds. Group label is renameable via modal.

**Blocked by:** xyflow scaffolding + sync layer + basic nodes + theme

- [ ] Group Node component: dashed rect with label; xyflow `parentId` + `expandParent` behavior
- [ ] parentId ↔ node_ids translation in sync hook: when node's xyflow `parentId` changes → compute `group_update` payload; when CDC delivers updated `node_ids` → compute `parentId` mapping
- [ ] Drag-in auto-containment: when a dragged node's bounding box overlaps a group rect on drop → set `parentId`, persist membership
- [ ] Drag-out: when a node is dragged out of a group rect on drop → clear `parentId`, persist removal
- [ ] Group member inclusion during group drag (children move with parent)
- [ ] Corner resize handle on group; minimum size enforced
- [ ] Group rename modal (double-click label → Dialog with read-only → edit toggle)
- [ ] Membership and visual containment may disagree (AI can add a far-away node to a group; the group rect expands to enclose it rather than teleporting the node)
- [ ] User can create a group node, drag nodes inside and outside, resize, rename, and see changes persist

---

## 6. Delete confirmation + undo/redo

**What to build:** Pressing Backspace or Delete on selected items opens a confirmation modal. A thin undo/redo stack covers node, edge, and group operations.

**Blocked by:** xyflow scaffolding + sync layer + basic nodes + theme

- [ ] `⌫`/Delete on selected nodes/edges/groups opens `<ConfirmDialog>`: title "Delete N nodes?" (or edges/groups), body lists affected items by name, Cancel (ghost) + Delete (danger) buttons; Enter confirms, Esc cancels
- [ ] Undo/redo hook fed by xyflow's `onNodesChange`/`onEdgesChange` callbacks: captures before/after diffs, stores inverse operations (create ↔ delete, move ↔ restore position, update ↔ restore prior state)
- [ ] Undo/redo stack covers node create/delete/move, edge create/delete, edge label update, group create/delete/rename
- [ ] Stack is per-canvas (cleared on canvas switch); max depth 50 entries
- [ ] Keyboard shortcuts: `⌘Z` undo, `⌘⇧Z` redo; shown in hints bar
- [ ] User can delete items with confirmation, undo mistakes, and redo across all entity types

---

## 7. Canvas management + polish

**What to build:** Canvas create/rename/delete uses the shared `ActionModal`. A hints bar shows keyboard shortcuts. Viewport position is restored when switching canvases. Remaining dead code is removed.

**Blocked by:** xyflow scaffolding + sync layer + basic nodes + theme

- [ ] CanvasModal migrated from custom action-list to shared `<ActionModal>` with create, rename, and delete sub-pages matching `IssueModal`'s pattern
- [ ] Per-canvas viewport persistence: on mount, read from `canvas_view_states` → `setViewport`; on xyflow's `onViewportChange`, 300ms debounce → write to `canvas_view_states`; bypasses CDC (no events, no re-fetch loop)
- [ ] Hints bar rendered at the bottom of the canvas showing current keyboard shortcuts (`⌘E` edit, `⌫` delete, `Space` pan, `⌘0` fit view, etc.)
- [ ] Original `CanvasModal.tsx` action-list code deleted; custom context-menu system for canvas deleted
- [ ] User can create, rename, and delete canvases through a familiar modal; viewport is remembered across canvas switches; keyboard shortcuts are discoverable
