# PRD: AI Workspace — Shell & Layout System

## Problem Statement

A developer wants a desktop environment for AI-assisted software design, but before building the full whiteboard, terminal, diff viewer, and MCP tooling, they need a working shell: the ability to create and manage Sessions, and a Blender-style split-pane Layout system where they can arrange panels by splitting and resizing regions. Without this shell, all other features (whiteboard, terminal, etc.) have nowhere to live. The shell must prove the Layout splitting mechanic works before committing to the full feature set.

## Solution

A Tauri + React desktop app with a left Session Sidebar and a main Layout area. The Session Sidebar lists all Sessions grouped by workingDirectory, supports CRUD, and shows reachability. The main area renders a Layout — a recursive tree of split panes — where the user can split any region vertically or horizontally and resize split boundaries by dragging. Panels are placeholders for future content. Layouts are saved as named global presets; each Session remembers its active Layout.

## User Stories

1. As a developer, I want to launch the app and see a left sidebar and a main panel area, so that I have a clear starting point.
2. As a developer, I want to create a new Session by providing a workingDirectory path and a session name, so that I can start a new workspace.
3. As a developer, I want to see all my Sessions listed in the sidebar grouped by workingDirectory, so that I can quickly find Sessions by project.
4. As a developer, I want the sidebar to show dimmed "missing" Sessions whose workingDirectory no longer exists, so that I know which Sessions are unreachable.
5. As a developer, I want to rename a Session inline from the sidebar, so that I can fix typos or update names without deleting and recreating.
6. As a developer, I want to delete a Session from the sidebar, so that I can clean up unused workspaces.
7. As a developer, I want to open a Session by clicking it in the sidebar, so that I can switch between workspaces.
8. As a developer, I want the app to automatically mark Sessions as paused on startup (crash safety), so that a prior crash doesn't leave Sessions stuck in "running" state.
9. As a developer, I want to see a blank panel occupying the initial Layout when I open a new Session, so that I know the Layout system is working.
10. As a developer, I want to split a panel region vertically by triggering a "Split Vertical" action, so that I can create side-by-side panels.
11. As a developer, I want to split a panel region horizontally by triggering a "Split Horizontal" action, so that I can create stacked panels.
12. As a developer, I want to resize the boundary between two split panels by dragging the divider, so that I can give more space to the panel I'm focused on.
13. As a developer, I want to split nested regions — splitting a split child further — so that I can create complex multi-panel arrangements.
14. As a developer, I want to save my current Layout as a named preset (e.g. "Debug Layout"), so that I can reuse it later.
15. As a developer, I want to see a list of my saved Layout presets, so that I can switch between them.
16. As a developer, I want each Session to remember which Layout it was using, so that reopening a Session restores my preferred panel arrangement.
17. As a developer, I want to delete a Layout preset I no longer need, so that my preset list stays clean.
18. As a developer, I want newly created Sessions to start with a default single-panel Layout, so that I don't have to configure Layouts before using a Session.
19. As a developer, I want the active Layout for a Session to persist across app restarts, so that I don't lose my arrangement when I quit.
20. As a developer, I want to close a Session (switching back to no active Session), so that I can return to an empty state without quitting the app.

## Implementation Decisions

### Module decomposition

Two Rust backend crates (tests included) and three React frontend modules:

- **SessionRegistry** (Rust): Manages the Session Registry (`sessions.json` in App Support Dir). Owns session CRUD, the running/paused/missing state machine, and reachability checking. Reachability is checked on list by testing whether the workingDirectory path exists on disk. On startup, any Session in `running` state is demoted to `paused`.

- **LayoutStore** (Rust): Manages Layout presets (`layouts.json` in App Support Dir). Owns Layout CRUD and the per-Session active Layout mapping (stored as `active_layout_id` on each Session record). A Layout is a recursive tree — each node is either a Split (direction: vertical or horizontal, ratio: float 0–1, children: [LayoutNode, LayoutNode]) or a PanelRef (panel_type: string, e.g. "blank"). Provides helper to produce a default single-panel Layout for new Sessions.

- **SplitLayout** (React): Renders a Layout tree recursively. Each Split node renders two child regions separated by a draggable divider (a resizable split pane library such as `allotment` or `react-resizable-panels`). Each PanelRef leaf renders a Panel component. Provides a context menu on each region with "Split Vertical" and "Split Horizontal" actions. Emits updated Layout trees that are persisted via LayoutStore.

- **SessionSidebar** (React): Left sidebar panel. Fetches sessions from the backend on mount. Renders sessions grouped by workingDirectory with separators. Supports inline rename (click-to-edit on name), delete (with confirmation), and create (dialog with workingDirectory path input and name input). Dimmed rows for missing sessions. Highlights the currently active session.

- **App** (React): Top-level shell. Layout: SessionSidebar on the left (fixed width ~280px, resizable boundary), SplitLayout filling the remaining space. Routes the active Session's Layout to SplitLayout. Dispatches sidebar actions (create, open, rename, delete) to the backend.

### IPC contract

Tauri commands exposed from Rust to React:

| Command | Input | Output |
|---------|-------|--------|
| `create_session` | `working_dir: String, name: String` | `Session` |
| `list_sessions` | — | `Vec<SessionSummary>` (grouped by workingDirectory) |
| `rename_session` | `session_id: String, new_name: String` | `Session` |
| `delete_session` | `session_id: String` | `()` |
| `open_session` | `session_id: String` | `Session` (with active Layout) |
| `list_layouts` | — | `Vec<Layout>` |
| `save_layout` | `name: String, tree: LayoutTree` | `Layout` |
| `delete_layout` | `layout_id: String` | `()` |
| `set_active_layout` | `session_id: String, layout_id: String` | `()` |

### Data schema

Session record (in `sessions.json`):
```json
{
  "id": "uuid",
  "name": "My Session",
  "working_directory": "/path/to/repo",
  "state": "running | paused | missing",
  "active_layout_id": "uuid",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

Layout record (in `layouts.json`):
```json
{
  "id": "uuid",
  "name": "Debug Layout",
  "tree": {
    "type": "split",
    "direction": "vertical",
    "ratio": 0.5,
    "children": [
      { "type": "panel", "panel_type": "blank" },
      { "type": "panel", "panel_type": "blank" }
    ]
  }
}
```

Layout tree node:
```json
// Split node
{ "type": "split", "direction": "vertical | horizontal", "ratio": 0.5, "children": [LayoutNode, LayoutNode] }
// Panel leaf
{ "type": "panel", "panel_type": "blank" }
```

### Startup sequence

1. App launches, Rust backend initializes.
2. SessionRegistry loads `sessions.json`. Demotes any `running` sessions to `paused`.
3. Frontend mounts, calls `list_sessions` and `list_layouts`.
4. SessionSidebar renders. No Session is active until the user clicks one.
5. When user clicks a Session, `open_session` returns the Session with its `active_layout_id`. LayoutStore resolves the Layout tree. App renders it in SplitLayout.
6. If the Session has no active Layout, the default single-panel Layout is assigned and saved.

### Layout persistence model

- Layouts are global — saved once, usable by any Session.
- Each Session stores `active_layout_id` — a reference to a global Layout.
- When a user modifies a Layout (splits, resizes, adds panels), the modified tree is saved as the current Layout preset's tree. The user can "Save As" to create a new preset from the current arrangement.
- Deleting a Layout preset that is still referenced by Sessions is allowed — those Sessions will fall back to the default Layout on next open.

## Testing Decisions

### What makes a good test

Tests verify external behavior (inputs → outputs / side effects), not internal implementation details. For Rust backend modules, tests call the public API with known inputs and assert the returned data and filesystem state. Tests use temporary directories to avoid coupling to the real App Support Dir.

### Modules tested

Only the Rust backend modules receive tests:

- **SessionRegistry**: Test create, list, rename, delete, open (state transitions), startup demotion (running→paused), and reachability checking (existing vs missing workingDirectory).
- **LayoutStore**: Test save, list, delete, get/set active Layout, default Layout production, fallback behavior when referenced Layout is deleted.

### Prior art

No prior tests exist in this repo — this is the first code written.

## Out of Scope

- Whiteboard canvas — no Cards, Edges, or Frames
- Command Layer and Event system
- event-log.jsonl and Log Panel
- Terminal Panel (xterm.js + PTY)
- Diff Viewer Panel
- Workspace MCP, Codebase MCP, Codebase Viz MCP
- CLI tool
- Undo/redo stack
- Artifacts (AI-generated documents)
- Multi-window management
- Any AI integration
- Panel types beyond "blank" — the blank panel is a placeholder
- Layout "Save As" UI — only inline save of the current Layout is in scope
- Drag-and-drop panel reordering
- Floating/detached panels
- Keyboard shortcuts for split/layout actions
- Macros, scripting, multiplayer (explicitly dropped per user)

## Further Notes

- The "blank" panel is intentionally minimal — it renders nothing but a background and a label showing its type. Its purpose is to prove the Layout splitting mechanic works end-to-end before panels like the whiteboard or terminal are built on top of it.
- The Layout tree is deliberately simple (binary splits only). This keeps the split/render logic straightforward while still enabling arbitrary panel arrangements through nesting.
- Session reachability is checked on list, not tracked reactively. The user sees a dimmed row in the sidebar; there is no background file watcher.
- Layout resizes update the `ratio` field on the Split node in real-time as the user drags, then persist on drag-end to avoid excessive writes.
