# Layout Splitting Feature — Graph-Based Screen System

## Background

### Current System: Binary Split Tree

The current layout system uses a recursive binary split tree:

```
LayoutNode = Split { direction, ratio, children: [LayoutNode] }
           | Panel { panel_type, terminal_id }
```

- All tree manipulation lives on the **frontend** (`src/SplitLayout.tsx`) — the Rust backend only stores/retrieves the whole tree via `workspace_update_tree`
- Rendering is hardcoded to 2 children (`SplitLayout.tsx:334`: `children.slice(0, 2)`)
- Splits: corner-drag (4 handles per panel), ratio clamped 0.1-0.9
- Joins: sash double-click -> pick which child survives
- Resize: delegated to the `allotment` React library
- Persisted to SQLite as JSON text; silent fallback to default layout on parse error
- No undo/redo, no backend split/merge/resize commands, no tabs, no floating panels
- Only 2 panel types: `terminal` and `blank`

### Blender's System: Vertex/Edge Graph

Blender uses a **planar vertex/edge graph** — NOT a tree.

```
bScreen
  +- vertbase:  [ScrVert]  <- flat pool of 2D pixel-coordinate points
  +- edgebase:  [ScrEdge]  <- flat pool of vertex pairs (always axis-aligned)
  +- areabase:  [ScrArea]  <- flat list of rectangles, each referencing 4 ScrVert pointers
```

- **ScrVert**: `{ vec: {short x, short y}, newv: *ScrVert }` — pixel coordinates, `newv` used as temp redirect during merges
- **ScrEdge**: `{ v1, v2 }` — endpoints always sorted by pointer address; direction computed on the fly
- **ScrArea**: `{ v1(BL), v2(TL), v3(TR), v4(BR) }` — doesn't own vertices; adjacent areas share the same ScrVert pointers

The hierarchy: `WorkSpace -> WorkSpaceLayout -> bScreen -> ScrArea -> ARegion` (sub-regions like headers, toolbars within an area).

### Why a Graph Beats a Tree

- **T-junctions** (edges that don't span the full screen) are natural in a graph, impossible in a pure tree
- **Partial-width splits** — one area can span two others
- **Joining any two adjacent areas** regardless of how they were originally split
- **Dragging any edge** moves all co-linear connected edges together via flood-fill selection
- **No parent-child hierarchy** to maintain — adding/removing areas doesn't restructure anything

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data model | Full vertex/edge/area graph | Maximum flexibility, proven by Blender over 20+ years |
| Backend ops | Move all mutations to Rust | Single source of truth, invariant enforcement, AI-friendly |
| Rendering | Custom absolute-positioned divs, drop `allotment` | Freedom from tree constraint, conceptually simpler |
| Coordinates | Normalized 0.0-1.0 | Resolution-independent, supports T-junctions, no rescaling on resize |

---

## Phase 1: Rust Domain Model + Graph Operations

*No frontend changes. Pure Rust, fully testable in isolation.*

### 1a. New domain types (`crates/core/src/domain/screen.rs`)

Replace `LayoutNode`/`LayoutTree` with graph types:

```rust
pub struct Vertex { id: VertexId, x: f64, y: f64 }           // normalized 0.0-1.0
pub struct Edge   { id: EdgeId, v1: VertexId, v2: VertexId, border: bool }
pub struct Area   { id: AreaId, v1: VertexId, v2: VertexId, v3: VertexId, v4: VertexId,
                    panel_type: String, terminal_id: Option<String> }
pub struct Screen { vertices: Vec<Vertex>, edges: Vec<Edge>, areas: Vec<Area> }
```

Update `WorkspaceInstance.current_tree` -> `current_screen: Screen`, `Layout.tree` -> `screen: Screen`.

**Effort:** ~2 hrs. Straightforward struct definitions, serde derives. Note: `schemars::JsonSchema` is derived on `Direction`, `LayoutNode`, and `LayoutTree` in the current code but NOT on `Layout` — add the derive to `Screen` and its sub-types for MCP schema generation. The MCP crate uses `rmcp`'s `#[tool(param)]` macro for schema generation, not `schemars` directly.

### 1b. Graph operations (`crates/core/src/graph/`)

New module with all the core mutations, ported from Blender's logic:

| Function | Blender equivalent | What it does |
|----------|-------------------|--------------|
| `screen_new(width, height)` | `screen_add()` | Create initial screen: 4 verts, 4 edges, 1 area |
| `area_split(screen, area_id, axis, factor)` | `area_split()` | Add 2 verts + 5 edges + 1 area, reassign old area's verts |
| `screen_area_join(screen, src_id, tgt_id)` | `screen_area_join_ex()` | Trim misaligned overhangs, align edges, merge verts, delete area |
| `screen_area_close(screen, area_id)` | `screen_area_close()` | Find best neighbor, join into it |
| `resize_edge(screen, edge_id, new_pos)` | `area_move_apply_do()` | Flood-fill select connected verts, move them, enforce min sizes |
| `change_panel_type(screen, area_id, type)` | — | Swap panel_type on an area |

**Effort:** ~1-2 days. The split is ~50 lines. Join is the most complex (~150 lines with trim/align/merge). Resize with connected-edge selection is ~80 lines. Each needs min-size enforcement logic.

### 1c. Graph maintenance / cleanup

| Function | Purpose |
|----------|---------|
| `remove_duplicate_vertices(screen, epsilon)` | Merge co-located verts using `newv` redirect pattern |
| `remove_duplicate_edges(screen)` | Remove edges with same vertex pair |
| `remove_unused_edges(screen)` | Remove edges not bordering any area |
| `remove_unused_vertices(screen)` | Remove verts not referenced by any edge |
| `find_edge(screen, v1, v2)` | Lookup edge by vertex pair |
| `find_area_at_point(screen, x, y)` | Hit-test which area contains a point |
| `find_active_edge(screen, x, y, tol)` | Find edge near cursor for drag detection |
| `get_adjacency(screen, area_a, area_b)` | Returns direction (N/E/S/W) or None |
| `select_connected_edge(screen, edge_id)` | Flood-fill BFS over co-linear edges |

**Effort:** ~4-6 hrs. Each function is 20-40 lines. The flood-fill is the most involved.

### 1d. Validation

- Areas form valid rectangles (v1.x==v2.x, v3.x==v4.x, v1.y==v4.y, v2.y==v3.y)
- All vertex/edge references are valid
- No orphans, no duplicates (within epsilon)
- Minimum area sizes enforced
- Edges are axis-aligned

**Effort:** ~2 hrs.

### 1e. Tree-to-graph migration converter

Recursive function that walks the old `LayoutTree` and produces a `Screen`:
- Start with full-screen area (0,0)-(1,1)
- For each `Split` node, call `area_split` on the corresponding area
- Map `panel_type` and `terminal_id` onto leaf areas

**Effort:** ~2 hrs. The recursion is straightforward since splits are always binary.

### 1f. Unit tests

Test every graph operation:
- Split produces correct vert/edge/area counts
- Join restores original state when joining back
- Resize moves connected edges together
- Close picks the best neighbor
- Cleanup removes orphans
- Min-size enforcement prevents collapse
- Tree-to-graph conversion produces equivalent layout

**Effort:** ~4-6 hrs.

**Phase 1 total: ~3-4 days**

---

## Phase 2: Database Migration + Commands

*Depends on Phase 1.*

### 2a. Schema migration (v2 -> v3)

- `workspaces.current_tree` TEXT -> still TEXT but stores `Screen` JSON instead of `LayoutTree` JSON
- `layouts.tree` TEXT -> same
- Migration: read old JSON, convert via tree-to-graph, write new JSON
- Run inside a transaction, update schema version

**Effort:** ~3 hrs.

### 2b. New command variants (`crates/commands/src/command.rs`)

```rust
SplitArea { session_id, workspace_id, area_id, direction, factor }
JoinAreas { session_id, workspace_id, source_area_id, target_area_id }
CloseArea { session_id, workspace_id, area_id }
ResizeEdge { session_id, workspace_id, edge_id, position }
ChangePanelType { session_id, workspace_id, area_id, panel_type }
```

Each command in the executor:
1. Load workspace -> get `current_screen`
2. Call graph operation
3. Validate result
4. Persist `current_screen` to DB
5. Emit `WorkspaceChanged` event

**Effort:** ~4-6 hrs. Pattern is identical to existing commands, just calling graph ops instead of SQL directly.

### 2c. Deprecate `WorkspaceUpdateTree`

Keep it for backward compat but mark deprecated. Or convert it to accept a `Screen` instead of `LayoutTree`.

**Effort:** ~1 hr.

### 2d. Integration tests

Test command execution end-to-end through the executor:
- Split -> verify DB has updated screen
- Join -> verify area removed
- Resize -> verify vertices moved
- Commands emit correct events

**Effort:** ~3 hrs.

**Phase 2 total: ~1.5-2 days**

---

## Phase 3: MCP + Tauri Layer

*Depends on Phase 2.*

### 3a. MCP tools (`crates/mcp/src/lib.rs`)

Expose the 5 new commands as MCP tools:
- `split_area`, `join_areas`, `close_area`, `resize_edge`, `change_panel_type`
- Each takes typed params (with JSON schema via `rmcp`'s `#[tool(param)]` macro, same as existing tools)
- `get_screen` tool returns the full graph for AI rendering

**Effort:** ~2-3 hrs. Thin translation layer, same pattern as existing MCP tools.

### 3b. Tauri command handlers (`src-tauri/src/lib.rs`)

Wrap each command for frontend invocation:
- `split_area`, `join_areas`, `close_area`, `resize_edge`, `change_panel_type`
- Each calls executor, returns result, emits Tauri event

**Effort:** ~2 hrs. Boilerplate wrappers.

### 3c. Update event payloads

`WorkspaceChanged` event should include the updated `Screen` so the frontend can sync without an extra fetch.

**Effort:** ~1 hr.

**Phase 3 total: ~1 day**

---

## Phase 4: Frontend Rendering

*Depends on Phase 3. This is the biggest phase.*

### 4a. New TypeScript types

Replace `LayoutNode`/`LayoutTree`/`SplitData`/`PanelData` with `Vertex`/`Edge`/`Area`/`Screen` mirroring the Rust types.

**Effort:** ~1 hr.

### 4b. ScreenRenderer component (replaces `SplitLayout.tsx`)

Core rendering:

```
Screen + windowDimensions
  -> compute pixel rect per area (v1.x*width, (1-v2.y)*height, etc.)
  -> render each area as <div style={{position:'absolute', left, top, width, height}}>
  -> render panel content inside each area (terminal, blank, etc.)
```

- Single flat container, absolutely-positioned children
- No nesting, no `allotment`
- Panel registry stays the same

**Effort:** ~4-6 hrs. The math is simple; the work is in the React component structure.

### 4c. Sash component (edge drag handles)

For each internal edge (not borders):
- Render a thin draggable bar at the edge position
- On drag: compute new normalized position, call `resize_edge` Tauri command
- Visual feedback: highlight on hover, cursor change (col-resize / row-resize)
- Min-size enforcement happens backend-side, but client-side preview should respect it too

**Effort:** ~4-6 hrs. Drag interaction + visual polish.

### 4d. Split interaction (corner drag)

Port from current `useSplitDrag` but:
- On drag end -> call `split_area(area_id, direction, factor)` instead of tree manipulation
- Live preview: show a line at the split position during drag
- Direction computed from drag gesture (same as current)

**Effort:** ~3-4 hrs. Logic is similar to current, just calls backend instead of manipulating tree.

### 4e. Join interaction (sash action)

Port from current `useJoinMode` but:
- Double-click sash -> enter join mode
- Pick which area survives -> call `join_areas(source_id, target_id)`
- Highlight areas during selection

**Effort:** ~2-3 hrs.

### 4f. Panel type selector

Update to operate on `area_id` instead of tree path. Calls `change_panel_type`.

**Effort:** ~1 hr.

### 4g. State management

Replace tree-based state with screen-based:
- `handleScreenChange` -> optimistic local update + debounced persistence
- But mutations now go through Tauri commands, not direct tree replacement
- **Add listener for `workspace-changed` event** — this event is emitted by the backend but currently NOT listened to anywhere in the frontend. `sessions-changed` is handled in `SessionContext.tsx`, `layouts-changed` in `App.tsx`, but `workspace-changed` has no handler. This must be added so the frontend syncs after backend mutations.
- Handle command errors -> revert optimistic update

**Effort:** ~3-4 hrs. The optimistic update + revert pattern is the tricky part. Adding the missing `workspace-changed` listener is straightforward but essential.

### 4h. Zoom

Update zoom to work with area IDs instead of tree paths. When zoomed, render only that area's rect at full window size.

**Effort:** ~1-2 hrs.

### 4i. Remove old files

Delete or gut: `SplitLayout.tsx`, `src/utils/layoutTreeUtils.ts`, `src/utils/migrateTree.ts`. Clean up `App.tsx` references.

**Effort:** ~1 hr.

**Phase 4 total: ~3-4 days**

---

## Phase 5: Polish + Edge Cases

*After core functionality works.*

### 5a. Window resize behavior

With normalized coords, this is just re-render. But need to verify terminal panels resize correctly (xterm.js `fit()`).

**Effort:** ~1-2 hrs.

### 5b. Terminal persistence during layout changes

When an area is joined/closed, its terminal must be disposed. When split, new terminals created. Ensure PTY lifecycle is correct.

**Note:** The current loading gate is an overlay (not an unmount) — all sessions' SplitLayouts stay mounted simultaneously, hidden via `display: none/block`. This means terminal persistence during session switches is already better than expected. The main remaining concern is the zoom feature unmounting siblings, which is a smaller issue.

**Effort:** ~1-2 hrs. Less work than originally estimated since SplitLayout is not unmounted on session switch.

### 5c. Snapping (optional)

Snap edge positions to 1/12ths or 1/24ths during resize. Snap to adjacent vertex positions.

**Effort:** ~2 hrs. Optional, can ship without.

### 5d. Error handling

- Backend returns errors for invalid operations (area too small to split, can't join non-adjacent areas, etc.)
- Frontend shows toast/error and reverts optimistic update

**Effort:** ~2-3 hrs.

### 5e. Migration testing

Test on real user data (existing SQLite DB with tree-based layouts). Verify all workspaces convert correctly.

**Effort:** ~2 hrs.

**Phase 5 total: ~1-1.5 days**

---

## Total Estimate

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| 1 | Domain model + graph ops + tests | 3-4 days | None |
| 2 | DB migration + commands | 1.5-2 days | Phase 1 |
| 3 | MCP + Tauri layer | 1 day | Phase 2 |
| 4 | Frontend rendering | 3-4 days | Phase 3 |
| 5 | Polish + edge cases | ~1 day | Phase 4 |
| **Total** | | **~10-11.5 days** | |

---

## Verification Results

The plan was verified against the actual codebase by an explore agent. ~50 assumptions confirmed, 8 corrections made:

| # | Original claim | Actual | Correction applied |
|---|---------------|--------|-------------------|
| 1 | `Layout` derives `schemars::JsonSchema` | Only `Direction`, `LayoutNode`, `LayoutTree` derive it — `Layout` does not | Noted in Phase 1a |
| 2 | 21 command variants | **20** command variants | Count corrected |
| 3 | Repositories at `crates/core/src/database/` | Actually at `crates/core/src/repositories/` | Paths corrected below |
| 4 | MCP crate uses `schemars` for JSON schema | Uses `rmcp`'s `#[tool(param)]` macro | Noted in Phase 1a and 3a |
| 5 | Frontend listens for `workspace-changed` event | **Not listened to anywhere** — `sessions-changed` in `SessionContext.tsx`, `layouts-changed` in `App.tsx` | Noted in Phase 4g as a task to add |
| 6 | Loading gate unmounts SplitLayout on session switch | **Wrong** — it's an overlay; all sessions' layouts stay mounted (hidden via `display`) | Noted in Phase 5b, effort reduced |
| 7 | Panels at `src/panels/TerminalPanel.tsx` | Actually at `src/TerminalPanel.tsx` and `src/BlankPanel.tsx` | Paths corrected below |
| 8 | ADR files under `.aw/adr/` | **No ADR files exist anywhere in the repo** | No ADR references in plan |

### Corrected file paths

| Old path | Correct path |
|----------|-------------|
| `crates/core/src/database/workspace_repository.rs` | `crates/core/src/repositories/workspace_repository.rs` |
| `crates/core/src/database/layout_repository.rs` | `crates/core/src/repositories/layout_repository.rs` |
| `src/panels/TerminalPanel.tsx` | `src/TerminalPanel.tsx` |
| `src/panels/BlankPanel.tsx` | `src/BlankPanel.tsx` |

---

## Key Risk Areas

1. **Join with misaligned areas** (Phase 1b) — the trim-then-join logic is the most complex algorithm. Port carefully from Blender, test extensively.
2. **Connected edge selection** (Phase 1c) — the flood-fill is subtle. Edge cases with T-junctions need care.
3. **Optimistic updates + revert** (Phase 4g) — if a backend command fails, the frontend must cleanly revert. This is a common source of UI bugs.
4. **Sash drag UX** (Phase 4c) — replacing `allotment`'s polished sash with a custom one. The interaction feel matters for usability.

---

## What Stays the Same

- Session/workspace/template lifecycle — unchanged
- PTY management (`src-tauri/src/pty.rs`) — unchanged
- Terminal panel rendering (`src/TerminalPanel.tsx`) — unchanged
- Panel registry pattern (`src/panelRegistry.tsx`) — unchanged
- SQLite database — same schema, just different JSON in TEXT columns
- Tauri event system — same events, same flow (`sessions-changed`, `layouts-changed`, `workspace-changed` emitted from `src-tauri/src/lib.rs:20-28`)
- MCP architecture — same pattern (`rmcp` `#[tool]` macro), new tools
- Loading gate behavior — overlay pattern (not unmount), all sessions' layouts stay mounted simultaneously

---

## Reference: Blender Source Files

Key files studied from https://github.com/blender/blender:

| File | Purpose |
|------|---------|
| `source/blender/makesdna/DNA_screen_types.h` | ScrVert, ScrEdge, ScrArea, bScreen structs |
| `source/blender/makesdna/DNA_workspace_types.h` | WorkSpace, WorkSpaceLayout structs |
| `source/blender/makesdna/DNA_windowmanager_types.h` | wmWindow struct |
| `source/blender/editors/screen/screen_edit.cc` | Core mutations: area_split, screen_area_join, screen_area_close |
| `source/blender/editors/screen/screen_geometry.cc` | Edge/vertex geometry: find_active_scredge, select_connected_edge, vertices_scale |
| `source/blender/editors/screen/screen_ops.cc` | Interactive operators: split, join, move (resize), docking |
| `source/blender/editors/screen/screen_intern.hh` | Internal header: eScreenDir, eScreenAxis, constants |
| `source/blender/editors/screen/screen_draw.cc` | Visual preview rendering |
| `source/blender/editors/include/ED_screen.h` | Public API |
| `source/blender/blenkernel/intern/screen.cc` | Screen lifecycle, persistence, duplication |
| `source/blender/blenkernel/intern/workspace.cc` | Workspace lifecycle |
