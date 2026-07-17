# Canvas Overhaul

## Problem Statement

The current Visual Canvas Panel has degenerated: a 247-line custom-cursor HUD that causes input lag, permanently-disabled context menu items ("Add to Group", "Add Tag"), an undo stack covering only nodes, `create_canvas_edge` and `create_canvas_group` missing from Tauri IPC (so edge creation fails through the UI), and an SVG/foreignObject rendering path with Safari bugs. Meanwhile, a prototype at `~/Desktop/clapet-canvas` proves that hybrid HTML-node + SVG-edge rendering with smooth-step edge routing and polished interaction feedback is achievable and feels great.

The user wants to overhaul the canvas frontend: adopt `@xyflow/react` (already in `package.json`, MIT) as the canvas engine, enrich the node data model, and replace context menus with the app's established modal patterns — while keeping the existing SQLite backend, CDC event flow, and MCP tools.

## Solution

Replace the custom canvas renderer with `@xyflow/react`. xyflow provides HTML-div nodes, SVG edges, smooth-step orthogonal routing, pan/zoom, node/edge drag, marquee selection, snap-to-grid, and group nesting (`parentId` + `expandParent`) — eliminating ~5,000 lines of custom canvas code. A two-way sync hook bridges xyflow's state to the backend command layer with optimistic local updates and CDC deduplication. Custom Node, Edge, Handle, and `connectionLineComponent` xyflow extensions deliver the visual richness from the prototype: handle-bob, verlet drag-rope, edge-brush glow, claw morph, and green confirmation ring. All modal interactions (node edit, edge edit, group rename, delete confirmation, canvas create/rename) use the existing `Dialog`/`ActionModal`/`ConfirmDialog` patterns. Context menus are removed.

The node data model is extended from a single `content` field to `title`, `description`, and `canvas_node_sources` (a new table supporting file paths and web links). The `canvas_node_sources` table adds one new repository, command variants, CDC event, and MCP tools. The existing `metadata_json` field is kept for forward compatibility.

## User Stories

1. As a user, I want the Visual Canvas Panel to feel responsive and smooth, so that I can arrange my thoughts without lag or jank.
2. As a user, I want to create a node by pressing a keyboard shortcut or clicking a toolbar button, so that I can add notes to my canvas quickly.
3. As a user, I want each node to show its title, tags, a description snippet, and a source count badge at a glance, so that I can scan my canvas without opening every node.
4. As a user, I want to double-click a node (or press `⌘E`) to open a read-only modal showing the node's full title, description, sources, and tags, so that I can review detailed information without accidentally editing it.
5. As a user, I want to press "Edit" inside the node modal to enter edit mode and modify the title, description, sources, and tags, so that I can update the node's information when I'm ready.
6. As a user, I want to add file paths (to code, markdown, or other files) and web links as sources on a node, so that I can reference the materials that informed my thinking.
7. As a user, I want to drag from a node's side handle to another node to create an edge between them, so that I can model relationships visually.
8. As a user, I want the edge drag interaction to show a verlet-simulated rope curve with a claw cursor and source/target glow feedback, so that I get satisfying visual feedback while connecting nodes.
9. As a user, I want settled edges to use smooth-step orthogonal routing with rounded corners, so that my diagrams stay readable even when densely connected.
10. As a user, I want to double-click a selected edge (or press `⌘E`) to open a read-only → edit modal for the edge label, so that I can name my relationships.
11. As a user, I want to drag nodes into a group's bounding box to add them to that group, so that I can organize related nodes spatially.
12. As a user, I want to drag a group and have all its member nodes move with it, so that I can rearrange clusters of nodes as a unit.
13. As a user, I want the group's bounding box to auto-expand when a child node is dragged beyond its edge, so that my groups naturally accommodate their contents.
14. As a user, I want to drag a node out of a group to remove it from that group, so that I can reorganize my canvas freely.
15. As a user, I want to double-click a group label to open a read-only → edit modal so that I can rename the group.
16. As a user, I want to press Backspace or Delete on selected nodes, edges, or groups to open a confirmation modal listing what will be deleted, so that I don't accidentally lose my work.
17. As a user, I want to undo and redo my canvas actions (including moves, creations, deletions, and edge changes), so that I can recover from mistakes.
18. As a user, I want to pan the canvas by scrolling and zoom with `⌘/Ctrl+wheel` (or pinch on a trackpad), so that navigation feels natural on any input device.
19. As a user, I want the canvas viewport (pan and zoom) to be remembered when I switch canvases, so that I can pick up where I left off.
20. As a user, I want to see a hints bar at the bottom showing the current keyboard shortcuts, so that I can discover interactions without memorizing them.
21. As a user, I want the AI to be able to create, update, and delete nodes, edges, and groups on my canvas via MCP, so that the agent can help me build diagrams.
22. As a user, I want AI-driven mutations to animate into view smoothly (via CDC events), so that I can see what the agent is doing in real time.
23. As a user, I want the canvas to respect my theme (dark/light) using the app's existing design tokens, so that it feels native to the rest of the application.
24. As a user, I want the canvas to respect my `data-motion` preference — all animations disabled when reduced motion is indicated, so that the app is accessible.
25. As a user, I want to create, rename, and delete canvases using the same modal pattern as the rest of the app, so that the interface is consistent.

## Implementation Decisions

### Architecture

- `@xyflow/react` (MIT licensed, already in `package.json`) is adopted as the canvas engine. This eliminates the custom `CanvasRenderer.tsx` (1,078 lines), the entire `CanvasModal.tsx` action-list code (migrated to shared `<ActionModal>`), `CursorFollower.tsx` (247 lines), and the custom context-menu system.
- The existing SQLite persistence layer (commands, repositories, CDC events, MCP tools) is preserved unchanged, except for the schema additions and Tauri command wiring described below.
- A sync hook bridges xyflow state to the backend: optimistic local updates on user interaction, CDC reconciliation on external mutations (AI via MCP). A "pending set" of locally-dirty entity IDs prevents CDC re-fetches from overwriting active drags or edits.

### Schema changes

- `canvas_nodes.content` is renamed to `canvas_nodes.title`. A new `description TEXT` column is added.
- New table `canvas_node_sources`: `id TEXT PRIMARY KEY`, `node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE`, `url TEXT NOT NULL`, `source_type TEXT NOT NULL CHECK (source_type IN ('file', 'link'))`, `sort_order INTEGER NOT NULL DEFAULT 0`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`.
- The `metadata_json` column on `canvas_nodes`, `canvas_edges`, and `canvas_groups` is kept unchanged for forward compatibility.

### New backend artifacts

- Domain struct: `CanvasNodeSource` (`id`, `node_id`, `url`, `source_type`, `sort_order`, `created_at`)
- Repository: `canvas_node_source_repository.rs` with `create`, `list_by_node`, `delete`, `delete_by_node`
- Command variants: `CanvasNodeSourceCreate`, `CanvasNodeSourceList`, `CanvasNodeSourceDelete`
- Domain event: `CanvasNodeSourcesChanged { session_id, canvas_id }`
- Tauri commands: `create_canvas_node_source`, `list_canvas_node_sources`, `delete_canvas_node_source`
- MCP tools: `node_source_add`, `node_source_list`, `node_source_remove`
- Existing `node_create` and `node_update` commands accept optional `title` and `description` params, with `content` mapped to `title` as a backward-compatible alias.

### Bug fix

- `create_canvas_edge` and `create_canvas_group` Tauri IPC commands are registered in `src-tauri/src/lib.rs`. These commands already exist in the executor and work via MCP; this wires the missing Tauri IPC route.

### Sync layer

- A custom hook (e.g., `useCanvasSync`) manages all xyflow ↔ backend communication. It subscribes to xyflow's `onNodesChange`, `onEdgesChange`, `onConnect`, `onViewportChange`, and the `onNodeDragStop`/`onSelectionDragStop` callbacks; maps them to backend command payloads; calls `safeInvoke`; and tracks a `Set` of locally-dirty entity IDs.
- On CDC events (`canvas-nodes-changed`, `canvas-edges-changed`, etc.), the hook fetches fresh state from the backend and applies it to xyflow via `setNodes`/`setEdges`, but skips entities whose IDs are in the pending set (to avoid overwriting active user interactions).
- Viewport persistence bypasses CDC: a 300ms debounced write to `canvas_view_states` on `onViewportChange`, no events emitted.

### Custom xyflow components

- **Custom Node**: an HTML div rendering title (prominent), tag pills, a description snippet (first ~80 chars, truncated, dimmed), and a source count badge (e.g., "3 sources"). Tags and source count are hidden when empty. On hover, the handle-bob CSS animation activates. Double-click or `⌘E` opens the node modal.
- **Custom Handle**: extends xyflow's handle with bob-keyframe animation (hidden by default, bobbing on node hover, still when connected). Uses the prototype's invisible-hit-area technique.
- **Custom Edge**: renders the settled smooth-step path (xyflow's `getSmoothStepPath` default). Double-click opens the edge modal.
- **connectionLineComponent**: renders the verlet drag-rope curve during edge creation, with an arrowhead that morphs into a claw (3-prong splay, tightens near target, clamps on release) — ported from the prototype's claw logic. Source node gets a violet glow ring, target node gets a capture pulse on brush hover, green confirmation ring on commit.
- **Group Node**: an xyflow group node rendered as a dashed rect with label. Children auto-include when their bounding box overlaps the group. `expandParent` behavior from xyflow is used: dragging a child beyond the group edge grows the parent.
- **Group membership mapping**: xyflow stores membership via `parentId` on the child; the backend stores it via `node_ids` on the group. The sync hook translates: when `node.parentId` changes, compute the `group_update` payload; when CDC delivers updated `node_ids`, compute the `parentId` mapping.

### Modals (following existing `Dialog`/`ActionModal`/`ConfirmDialog` patterns)

- **Node modal**: `⌘E` or double-click opens. Read-only view shows title, description, sources list, tags. Edit button (or `⌘E`) toggles to edit mode — fields become editable. Done button saves and returns to read-only. Uses `Dialog` with custom `header` prop (title + edit/done toggle button, matching `NewWorkspaceModal`).
- **Edge modal**: double-click opens. Same read-only → edit toggle pattern, but with label and metadata_json fields only. Uses `Dialog`.
- **Group rename modal**: double-click label opens. Read-only → edit toggle with a single name field. Uses `Dialog`.
- **Delete confirmation modal**: `⌫`/Delete on selected items opens `<ConfirmDialog>` with title "Delete N nodes?" (or edges/groups) and a body listing affected items by name. Cancel (ghost) + Delete (danger) buttons. Keyboard: Enter confirms, Esc cancels.
- **Canvas create/rename modal**: existing `CanvasModal.tsx` flavor is deleted. Canvas management uses `<ActionModal>` with create, rename, and delete sub-pages, matching `IssueModal`'s pattern.

### Deleted code

- `CursorFollower.tsx` and its imports — causes input lag.
- Custom context menu system used by the canvas panel — replaced by modals.
- `CanvasModal.tsx`'s custom action-list rendering — migrated to `<ActionModal>`.
- Any remaining `foreignObject`-based inline editing.

### Theme integration

- A single CSS block scoped to the canvas panel maps `--xy-*` variables to the app's design tokens (`--bg-primary`, `--text-primary`, `--accent`, `--border`, `--radius-md`, etc.). Uses the dark-theme defaults from the existing token system. Changes automatically inherit light/dark mode because tokens are CSS variables.
- The verlet rope `connectionLineComponent` renders directly via SVG; its stroke color uses the `--accent` token.
- All custom xyflow component CSS respects `:root[data-motion="full"]` — when absent, animations are disabled.

### Prototype-sourced decisions

- The verlet drag-rope simulation (20 particles, gravity 1500px/s², damping 0.93, 12 constraint iterations, fixed 1/120s timestep, max 8 steps/frame) is ported from the prototype's rope system. It runs only during edge creation/rewire drag interactions, not for settled edges.
- The claw morph (22° splay, tightens to 12° near target, clamps to -5° on release) is ported from the prototype's edge brush.
- Handle bob keyframes (4 side-specific variants, 1.8s loop) are ported from the prototype's handle CSS.

## Testing Decisions

- The primary test seam is the sync hook. Integration tests mock `safeInvoke` (the Tauri IPC bridge), simulate xyflow callback events, and verify the correct backend command payload shapes, debounce timing, and CDC reconciliation behavior. This pattern matches existing hook-level tests in the codebase.
- Backend tests for the new `canvas_node_source_repository` and the schema migration follow the existing pattern in `crates/core/src/repositories/*.rs` (Rust unit tests with in-memory SQLite, matching `canvas_node_repository.rs`).
- Modal components follow the existing pattern: render with mock handlers, verify keyboard navigation (Enter/Esc/arrows), verify edit mode toggle, verify delete confirmation flow.
- Custom xyflow components are verified through the sync hook integration tests (behavior) and manual visual review (appearance). Snapshot tests are deferred — the xyflow component API is too fluid.
- Tests verify external behavior only: correct backend command dispatch, correct CDC merge logic, correct viewport persistence timing. No tests on xyflow internals or animation frame counts.

## Out of Scope

- Undo/redo across canvas switches (the stack is per-canvas and cleared on switch)
- Export/save/load of canvas state to files (no JSON export, no image export)
- Minimap
- Typed node kinds (the 16 prototype kinds are not ported — nodes remain generic)
- Tag colors or tag categories (tags remain simple strings as per v1 glossary)
- Non-contiguous multi-select (xyflow's default behavior is kept)
- Context menus anywhere in the canvas
- Rope physics for settled edges (verlet runs only during drag)
- Shockwave ripple on node creation

## Further Notes

- The prototype at `~/Desktop/clapet-canvas` remains a reference but is not part of the implementation. The verlet rope, claw morph, and handle-bob are ported from it.
- The xyflow library reference at `~/repos/01_general/xyflow` was studied for architecture patterns (store design, coordinate system, group nesting, edge routing, drag behavior) but is not a dependency beyond the npm package already in `package.json`.
