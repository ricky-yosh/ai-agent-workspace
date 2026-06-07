# Context

## Domain Language

| Term | Definition | Avoid |
| --- | --- | --- |
| **Whiteboard** | The visual canvas where Cards, Edges, and Frames are placed and manipulated. | Canvas, Board |
| **Card** | A node on the whiteboard with title, content, and position. | Node, Sticky |
| **Edge** | A directed connection from one Card to another. | Link, Arrow, Connection |
| **Frame** | A titled bounding box that groups Cards and Edges into a named region. | Group, Area, Zone |
| **Command** | A canonical operation (e.g. CreateCard) dispatched through the Command Layer — the single execution path for all interfaces. | Action, Operation |
| **Event** | A persisted record of a successfully executed Command, appended to event-log.jsonl. Powers replay and audit. Displayed in the Log Panel. | Record |
| **Session** | A UUID-identified workspace instance tied to a workingDirectory. Has state (running, paused, missing), a whiteboard, event-log, and artifacts. All state stored in App Support Dir. | Project, Workspace |
| **workingDirectory** | The filesystem path (typically a git repo root) that a Session is associated with. Used to group Sessions in the sidebar. | Repo root, Project dir |
| **Session Registry** | A global JSON file at `~/Library/Application Support/AI Agent Workspace/sessions.json` listing all known Sessions and their serialized state across all workingDirectories. | Session index, Master list |
| **Session Sidebar** | The left-hand UI panel that lists all Sessions grouped by workingDirectory, with inline rename, CRUD, and context menu actions. | Session picker, Session list |
| **Session Reachability** | Whether a Session's workingDirectory exists on disk. Missing directories produce **missing Sessions** shown dimmed in the sidebar. | Stale, Orphaned |
| **Artifact** | An AI-generated document (e.g. architecture plan) stored in App Support under the session. Editable through the app UI. | Document, File |
| **Panel** | A UI region in the split-screen layout (e.g. whiteboard panel, log panel, terminal panel, diff viewer panel). | Pane, Window |
| **Layout Template** | A global blueprint/ preset defining the split arrangement of Panels (e.g. "General", "Modeling"). Stored in `layouts.json` — read-only during normal use. Users can explicitly save new templates here. | Layout, Preset, Blueprint |
| **Workspace Instance** | An editable instance of a Layout Template owned by a Session. Contains its own `current_tree`, `name`, and `template_id` referencing the source template. Stored in the Session's `workspaces` array in `sessions.json`. Deleting it does not affect the source template. | Tab, Workspace, Layout Tab |
| **Workspace MCP** | The MCP server that lets AI agents manipulate whiteboard state, sessions, panels, and artifacts. | App MCP, Control MCP |
| **Codebase MCP** | The MCP server for raw code intelligence — file search, symbol lookup, references, semantic search. | Sourcegraph MCP, Code MCP |
| **Codebase Viz MCP** | The MCP server that auto-generates whiteboard diagrams from code structure (dependency graphs, call hierarchies, module maps). Composes Codebase MCP data with Workspace MCP placement. | CodeSee MCP, Map MCP |
| **event-log.jsonl** | The append-only JSONL file in App Support Dir where all Events are persisted. Used to reconstruct workspace state and provide an audit trail. | Event Store, Event log |
| **Command Layer** | The single internal execution path through which all interfaces (CLI, MCP, UI) dispatch Commands. | Dispatcher, Mediator |
| **App Support Dir** | `~/Library/Application Support/AI Agent Workspace/` (macOS) — the canonical storage location for all session state, registry, and event-log.jsonl files. Nothing written to the repository. | Data dir, Config dir |

## Relationships

- A **Session** belongs to one **workingDirectory**; a workingDirectory can have many Sessions.
- The **Session Registry** (in App Support Dir) lists all Sessions and holds their serialized state; the **Session Sidebar** groups them by workingDirectory.
- A **Session** has states: `running` (active in a window), `paused` (not open), `missing` (workingDirectory unreachable).
- On startup, any `.running` Sessions are demoted to `.paused` for crash safety.
- A **Session** contains one **Whiteboard**, one **event-log.jsonl**, and zero or more **Artifacts**.
- A **Whiteboard** contains zero or more **Cards**, **Edges**, and **Frames**.
- Every **Command** produces one or more **Events** when executed.
- Every **Event** is appended to **event-log.jsonl** and displayed in the **Log Panel**.
- The **CLI**, **UI**, and all three **MCP** servers are adapters that translate their inputs into **Commands** dispatched through the **Command Layer**.
- The **CLI** communicates with the app via Tauri IPC — it does not directly read or write state files.
- **Codebase Viz MCP** composes **Codebase MCP** (for data) and **Workspace MCP** (for whiteboard placement).
- **Window management** prevents the same Session from being open in two windows simultaneously.
- **Layout Templates** are defined globally in `layouts.json` (the global library). **Workspace Instances** are per-session editable copies of a template, stored in the Session's `workspaces` array in `sessions.json`.
- A **Session** owns zero or more **Workspace Instances** (its tab bar). Each Workspace Instance references a **Layout Template** by `template_id`. Deleting an instance does not affect the source template.
- A **Session** has one `active_workspace_id` pointing to the currently active **Workspace Instance**.
- The **`+` dropdown** in the tab bar shows **Layout Templates** (global library). Clicking one creates a new **Workspace Instance** for the current Session.

## Decisions

- Use **Tauri + React (React Flow)** for the desktop application (see ADR 0001).
- Use **Rust** for the backend core, command layer, CLI, and MCP servers.
- Whiteboard primitives limited to **Card, Edge, Frame** — no additional node types for v1.
- All session state, registry, and event-log.jsonl live in **App Support Dir** — nothing written to the repository (see ADR 0002).
- **Session Sidebar** groups Sessions by workingDirectory, supports inline rename, CRUD, and reachability display.
- Blender-style **Layout Template / Workspace Instance** system: global Layout Templates (`layouts.json`) are immutable blueprints. Each Session owns a `workspaces` array of editable Workspace Instances referencing a template by ID. Users can split, resize, and add panels to any region in an instance (see ADR 0004).
- All writes to session state are atomic.
- **Diff Viewer Panel** uses `git diff` against the repository — no independent versioning system.
- **Terminal panel** uses a real PTY via xterm.js + Tauri's PTY backend — runs any interactive CLI tool (Claude Code, Codex, etc.).
- **Codebase MCP** is full-scope: tree-sitter for symbol extraction, LSP integration for references/callers/callees, and semantic search.
- **CLI** dispatches Commands via Tauri IPC — not via file writes.
- Undo/redo is a global in-memory stack at the Command Layer — not persisted. Used for instant undo, not long-term history.
