# Context

## Domain Language

| Term | Definition | Avoid |
| --- | --- | --- |
| **Whiteboard** | The visual canvas where Cards, Edges, and Frames are placed and manipulated. | Canvas, Board |
| **Card** | A node on the whiteboard with title, content, and position. | Node, Sticky |
| **Edge** | A directed connection from one Card to another. | Link, Arrow, Connection |
| **Frame** | A titled bounding box that groups Cards and Edges into a named region. | Group, Area, Zone |
| **Command** | A canonical operation (e.g. CreateSession) dispatched through the Command Layer — the single execution path for all interfaces. | Action, Operation |
| **Event** | A persisted record of a successfully executed Command, appended to event-log.jsonl. Powers replay and audit. Displayed in the Log Panel. | Record |
| **Session** | A UUID-identified workspace instance tied to a workingDirectory. Has state (running, paused, missing), a whiteboard, event-log, and artifacts. All state stored in App Support Dir. | Project, Workspace |
| **workingDirectory** | The filesystem path (typically a git repo root) that a Session is associated with. Used to group Sessions in the sidebar. | Repo root, Project dir |
| **Session Registry** | A global JSON file at `~/Library/Application Support/AI Agent Workspace/sessions.json` listing all known Sessions and their serialized state across all workingDirectories. | Session index, Master list |
| **Session Sidebar** | The left-hand UI panel that lists all Sessions grouped by workingDirectory, with inline rename, CRUD, and context menu actions. | Session picker, Session list |
| **Session Reachability** | Whether a Session's workingDirectory exists on disk. Missing directories produce **missing Sessions** shown dimmed in the sidebar. | Stale, Orphaned |
| **Artifact** | An AI-generated document (e.g. architecture plan) stored in App Support under the session. Editable through the app UI. | Document, File |
| **Panel** | A UI region in the split-screen layout (e.g. whiteboard panel, log panel, terminal panel, diff viewer panel). | Pane, Window |
| **Layout Template** | A global blueprint/preset defining the split arrangement of Panels (e.g. "General", "Modeling"). Stored in `layouts.json` — read-only during normal use. Users can explicitly save new templates here. | Layout, Preset, Blueprint |
| **Built-in Template** | A Layout Template with `built_in: true` — permanent and undeletable. Seeded automatically ("General" on first session-open). Cannot be deleted or renamed. | System template, Seed template |
| **Workspace Instance** | An editable instance of a Layout Template owned by a Session. Contains its own `current_tree`, `name`, and `template_id` referencing the source template. Stored in the Session's `workspaces` array in `sessions.json`. Deleting it does not affect the source template. | Tab, Workspace, Layout Tab |
| **MCP Server** | The monolithic server exposing all tools — ships in two modes: embedded (Tauri plugin) for live GUI updates, and **standalone binary** (`aiaw-mcp-server`) for AI tool CLI connectivity via stdio subprocess. Both share state via App Support Dir. | Workspace MCP, Codebase MCP, Codebase Viz MCP, App MCP, Control MCP |
| **event-log.jsonl** | The append-only JSONL file in App Support Dir where all Events are persisted. Used to reconstruct workspace state and provide an audit trail. | Event Store, Event log |
| **Command Layer** | The single internal execution path through which all interfaces (MCP, UI) dispatch Commands. Contains the Command enum and an executor that dispatches to core modules. | Dispatcher, Mediator |
| **App Support Dir** | `~/Library/Application Support/AI Agent Workspace/` (macOS) — the canonical storage location for all session state, registry, and event-log.jsonl files. Nothing written to the repository. | Data dir, Config dir |
| **Preferences Window** | A separate Tauri window (Cmd+,) for configuring app settings — preferred external tools, editor, diff tool, and terminal. | Settings, Config panel |
| **Toast Notification** | A transient auto-dismissing message banner displayed in the bottom-right of the app window to surface feedback (e.g. "no editor configured"). | Alert, Snackbar |
| **External Editor** | A user-configured code editor (Cursor, VS Code, etc.) launched in the session's workingDirectory from the sidebar context menu. | Code editor preference |
| **External Diff Tool** | A user-configured diff/merge tool (Fork, GitKraken, etc.) launched in the session's workingDirectory from the sidebar context menu. | Visual diff tool |
| **External Terminal** | A user-configured terminal application (iTerm2, Warp, etc.) launched in the session's workingDirectory from the sidebar context menu. | Terminal preference |
| **Terminal Panel** | An in-app Panel Type that runs a real PTY via xterm.js + portable-pty, scoped to one Session. Spawns the user's configured CLI tool (default `$SHELL`) with `AIAW_SESSION_ID` injected. Survives session/workspace switches and is killed only when the panel node is removed from the layout tree. | In-app terminal, PTY panel |
| **CLI Tool** | The user-configured command spawned inside a Terminal Panel's PTY (preference key: `pty_command`). Defaults to `$SHELL`. Distinct from **External Terminal** which is a desktop app launched outside the app. | Pty command, Shell command |
| **Panel Type Selector** | A Blender-style dropdown button in the top-left corner of every panel. Switches the panel type (e.g. "Blank" → "Terminal") without removing the panel from the layout tree. | Editor type dropdown |
| **Split Handle** | The empty corners of a panel (not the selector button area). Dragging any corner creates a new split, preserving the parent panel's type. | Grip, Drag corner |
| **Join Area** | A right-click action on a split border that merges two adjacent panels. Shows a directional triangle arrow, hides the cursor, and grays out the panel that will be consumed. Inverse of split. | Merge panels |

## Relationships

- A **Session** belongs to one **workingDirectory**; a workingDirectory can have many Sessions.
- The **Session Registry** (in App Support Dir) lists all Sessions and holds their serialized state; the **Session Sidebar** groups them by workingDirectory.
- A **Session** has states: `running` (active in a window), `paused` (not open), `missing` (workingDirectory unreachable).
- On startup, any `.running` Sessions are demoted to `.paused` for crash safety.
- A **Session** contains one **Whiteboard**, one **event-log.jsonl**, and zero or more **Artifacts**.
- A **Whiteboard** contains zero or more **Cards**, **Edges**, and **Frames**.
- Every **Command** produces one or more **Events** when executed.
- Every **Event** is appended to **event-log.jsonl** and displayed in the **Log Panel**.
- The **UI** and **MCP Server** are adapters that translate their inputs into **Commands** dispatched through the **Command Layer**.
- **Window management** prevents the same Session from being open in two windows simultaneously.
- **Layout Templates** are defined globally in `layouts.json` (the global library). **Workspace Instances** are per-session editable copies of a template, stored in the Session's `workspaces` array in `sessions.json`.
- A **Session** owns zero or more **Workspace Instances** (its tab bar). Each Workspace Instance references a **Layout Template** by `template_id`. Deleting an instance does not affect the source template.
- A **Session** has one `active_workspace_id` pointing to the currently active **Workspace Instance**.
- The **`+` dropdown** in the tab bar shows **Layout Templates** (global library). Clicking one creates a new **Workspace Instance** for the current Session.
- The **Built-in Template** "General" is seeded by `session_open` with a **Terminal Panel** as its root. It is permanent — `delete_layout` and `rename_layout` reject it. User-created templates are always deletable. The former "Default" template is removed as redundant.

## Decisions

- Use **Tauri + React (React Flow)** for the desktop application (see ADR 0001).
- Use **Rust** for the backend core, command layer, and MCP Server.
- Whiteboard primitives limited to **Card, Edge, Frame** — no additional node types for v1.
- All session state, registry, and event-log.jsonl live in **App Support Dir** — nothing written to the repository (see ADR 0002).
- **Session Sidebar** groups Sessions by workingDirectory, supports inline rename, CRUD, and reachability display.
- Blender-style **Layout Template / Workspace Instance** system: global Layout Templates (`layouts.json`) are immutable blueprints. Each Session owns a `workspaces` array of editable Workspace Instances referencing a template by ID. Users can split, resize, and add panels to any region in an instance (see ADR 0004).
- All writes to session state are atomic.
- **Diff Viewer Panel** uses `git diff` against the repository — no independent versioning system.
- **Terminal panel** uses a real PTY via xterm.js + Tauri's PTY backend — runs any interactive CLI tool (Claude Code, Codex, etc.).
- **MCP Server** is monolithic and in-process when embedded in the GUI (see ADR 0009). Also ships as a **standalone binary** (`aiaw-mcp-server`) that reads/writes App Support Dir directly, enabling AI tools (Claude Code, Codex, Cursor) to connect via standard stdio subprocess. Both GUI-embedded and standalone modes share the same state files. 18 tools wrapping the 18 Command variants. Codebase tools added when corresponding Commands exist.
- **MCP Handler** uses callback fields (`on_session_changed`, `on_layouts_changed: Option<Arc<dyn Fn() + Send + Sync>>`) for event emission, not `AppHandle`. Embedded mode wires Tauri `app.emit()`; standalone mode passes `None`. `tauri` is an optional dependency gated behind the `tauri-integration` feature.
- **Standalone MCP binary** (`crates/mcp-server`, binary name `aiaw-mcp-server`) is a Tauri-free binary. AI tools connect via: `claude mcp add aiaws -- aiaw-mcp-server`. Inherits `AIAW_SESSION_ID` from parent PTY shell.
- Undo/redo is a global in-memory stack at the Command Layer — not persisted. Used for instant undo, not long-term history.
- **Cargo workspace** with four crates: `core` (domain logic), `commands` (Command enum + executor), `mcp` (MCP server library + optional Tauri plugin), `mcp-server` (standalone MCP binary). The Tauri app depends on `commands` and `mcp`. See ADR 0009.
- A CLI was considered but removed in favor of GUI and MCP only.
- **Session orientation**: each Terminal Panel's PTY is spawned scoped to exactly one Session (never shared). At spawn time, the app injects an `AIAW_SESSION_ID` environment variable into the PTY's shell. The stdio-based MCP Server launched from within inherits the variable and uses it to attribute Commands to the correct Session — no filesystem lookups or explicit session arguments required from the agent (see ADR 0009).
- **Standalone MCP session resolution fallback**: when `aiaw-mcp-server` starts without `AIAW_SESSION_ID` (e.g. launched from Cursor or a user's normal shell, not an AIAW Terminal Panel), it matches its process `cwd` against `Session.workingDirectory` in `sessions.json`. Exactly one match is used; zero or multiple matches produce a fail-fast startup error instructing the user to set `AIAW_SESSION_ID`. Standalone-mode-only — embedded mode uses `AppState` directly (see ADR 0011).
- **Terminal restoration** is left to the underlying CLI tool's own resumption feature (e.g. `claude --resume`). The app does not attempt to keep the PTY process alive across restarts or reattach via a multiplexer — it's a thin convenience layer (remember last command/cwd, offer a "Resume" relaunch), not a guarantee.
- **Session sidebar context menu** provides six right-click actions: Open in Finder, Open in Editor, Open in External Diff, Open in Terminal, Copy SessionID, Copy Session Path. Open in Editor, Open in External Diff, and Open in Terminal launch external applications configured in Preferences — not in-app panels. Copy actions use the system clipboard. If a tool preference is unconfigured, clicking the action shows a **Toast Notification** directing the user to Preferences.
- **Preferences** are persisted via **tauri-plugin-store** as a key/value JSON file in the platform config directory.
- **Tool configuration** in Preferences uses a preset dropdown (Cursor, VS Code, iTerm2, Fork, etc.) plus a "Custom..." option that reveals a free-text path input.
- **Preferences Window** is structured as a single "External Tools" section in v1 with an extensible section-based layout. A clickable "Configure" button on the toast opens Preferences directly.
- **Built-in template** "General" is seeded by `session_open` with a `"terminal"` panel. The former "Default" template (seeded by the Tauri app) is removed — "General" is the single built-in template. Carries a `built_in: true` flag and is protected from deletion and renaming. `session_open` finds "General" by name rather than `layouts.first()` to avoid accidentally selecting a user template. See ADR 0012.
- **PTY backend** uses the `portable-pty` crate for cross-platform pseudoterminal spawning. Frontend-backend IPC uses Tauri commands (writes: `pty_write`) and Tauri events (reads: `pty-output`). Each Terminal Panel gets its own PTY process, never shared.
- Panel components receive `path` and `workspaceId` via React Context (`PanelContext`), not via `PanelProps` expansion. SplitLayout wraps each panel in a `<PanelContext.Provider>` — TerminalPanel reads from context; other panel types ignore it.
- **Panel creation**: the built-in "General" template seeds with a `"terminal"` panel. Users switch panel types via the **Panel Type Selector** dropdown in each panel's top-left corner. Adding more panels to a workspace is done via the `+` dropdown in the tab bar (which creates from templates) or drag-to-split from corners.
- **Split** is initiated by dragging from any empty corner of a panel (not the selector button). The split preserves the parent panel's type — splitting a Terminal panel creates two Terminal panels.
- **Join Area** merges two adjacent panels: right-click a split border, select "Join Area", the consumed panel grays out with a directional arrow, click to confirm. The surviving panel keeps its type.
- **Terminal PTY lifecycle** has two distinct behaviors: **persist** (PTY process stays alive in the background when panel becomes invisible due to tab/session switch — frontend stops listening to events, no restart needed) and **restart** (process exit kills old PTY, spawns new one with new UUID — frontend updates its reference; if panel is hidden, restart is queued and frontend reconnects on visibility). The PTY is bound to the panel node in the layout tree; it only truly stops when the panel node is removed or the panel type changes.
- **Backend-driven restart on exit**: when the PTY process exits, the backend auto-restarts immediately — spawning a new PTY with a new UUID and updating its internal path→PTY mapping. If the frontend is listening, it receives a `pty-restart { oldPtyId, newPtyId, path }` event, shows a "restarting…" message in xterm.js, and switches its event stream to the new UUID. If the frontend is not listening (panel hidden), the restart is silent — the frontend calls `pty_spawn(path)` on re-mount and gets the new UUID via idempotent adoption.
- **Backend PTY cleanup via tree diff on `update_workspace_tree`**: when the frontend calls `update_workspace_tree`, the backend extracts all terminal panel paths from the new tree, compares against its internal path→PTY mapping, and kills any PTY whose path is absent from the new tree. The frontend has no PTY lifecycle responsibility — it just mutates the tree as usual. This handles both "panel removed via join" and "panel type changed from terminal to blank" without any special frontend logic. `pty_spawn` itself does not emit layout events — the tree is unchanged.
- **`pty_spawn(workspace_id, path)` is idempotent, backend-owned mapping**: the `pty_spawn(workspace_id, path)` Tauri command takes the workspace ID and the panel's tree path (e.g. `[0, 1, 0]`). The backend uses `workspace_id` to look up the session for `workingDirectory`; reads `pty_command` from tauri-plugin-store; spawns the configured CLI tool (or `$SHELL` if unset); injects `AIAW_SESSION_ID`; stores the PTY in an internal `HashMap<(WorkspaceId, PanelPath), PtyHandle>`; and returns `{ ptyId }`. If a PTY already exists at (workspace, path), it returns the existing UUID — adoption is automatic. The layout tree is unchanged. PanelProps gains `path?: number[]` — SplitLayout passes it when rendering each panel. `pty_write(ptyId, data)` and `pty_resize(ptyId, cols, rows)` use ptyId directly without workspace context.
- **PTY mapping is backend-owned, not in the layout tree**: the backend maintains an internal `HashMap<PanelPath, PtyHandle>` — the path (e.g. `[0, 1, 0]`) is the identifier. The layout tree has no `pty_id` field. `pty_spawn(path)` is idempotent: if a PTY exists at the path, it returns the existing UUID (adopt); otherwise it creates one (spawn). The TerminalPanel calls `pty_spawn(path)` on every mount — safe because idempotent. When the tree reorganizes via split/join, React unmounts old panels and mounts new ones with new paths, each getting its own PTY. The path is stable across tab switches (tree doesn't change), so re-mount after tab switch finds the same PTY via the same path. No data model changes to the layout tree are required.

## Open Questions

- Decide whether external issue trackers are in scope.
- Decide what metadata (last command, cwd) the app should remember per Session to power a "Resume terminal" relaunch affordance.
