# Architecture Handoff

A collaborative AI-native development environment built with Tauri v2 (Rust + React). The app manages terminal sessions, split-pane layouts, and exposes an MCP server so AI agents can control everything programmatically.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  SessionSidebar │ SplitLayout (recursive tree) │ xterm  │
│                  ↕ invoke() / events                     │
├─────────────────────────────────────────────────────────┤
│                   Tauri IPC Bridge                        │
│          29 registered commands (session/layout/pty)      │
│                  ↕ execute(Command)                       │
├─────────────────────────────────────────────────────────┤
│                  Command Layer (Rust)                     │
│  Command enum (20 variants) → execute() → CommandResult  │
│                  ↕ Arc<Mutex<AppState>>                   │
├─────────────────────────────────────────────────────────┤
│                  Core Domain (Rust)                       │
│  SessionRegistry │ LayoutStore │ PtyStore                 │
│                  ↕ file watcher                          │
├─────────────────────────────────────────────────────────┤
│                  MCP Server (stdio)                       │
│  19 tools │ in-process plugin OR standalone binary        │
│  (same Command layer as everything else)                  │
└─────────────────────────────────────────────────────────┘
```

**The key insight: every interface (GUI, MCP, CLI) funnels through the same `Command → execute() → CommandResult` pipeline.** This guarantees consistent behavior regardless of how a mutation enters the system.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript, Vite 7 |
| Terminal rendering | xterm.js 6 (WebGL, Unicode11, WebLinks) |
| Split panes | allotment (VS Code-style resizable splits) |
| Async runtime | Tokio (for MCP server) |
| MCP SDK | `rmcp` 0.1 (`modelcontextprotocol/rust-sdk`) |
| PTY | `portable-pty` 0.8 |
| Persistence | JSON files in `~/Library/Application Support/AI Agent Workspace/` |

---

## Command Pattern

This is the backbone of the entire app.

### The flow

```
User action (GUI click / MCP tool call / CLI)
  → Command variant created
  → execute(command, &AppState) called
  → Lock ordering respected (sessions → layouts)
  → CommandResult returned
  → Tauri events emitted (sessions-changed / layouts-changed)
  → Frontend auto-refreshes via useTauriEvent hooks
```

### Command enum (`crates/commands/src/command.rs`)

20 variants covering three domains:
- **Session:** `Create`, `Rename`, `Delete`, `Open`, `Close`, `List`, `DeleteAll`
- **Template (Layout):** `Save`, `Rename`, `Delete`, `List`, `DeleteAll`
- **Workspace:** `Add`, `Remove`, `Rename`, `SetActive`, `GetActive`, `List`, `UpdateTree`, `Reset`

### Why this matters for new features

To add a new mutation, you:
1. Add a variant to `Command`
2. Handle it in `execute()` in `crates/commands/src/executor.rs`
3. Add a Tauri command handler via `command_handler!` macro (or MCP tool)
4. Frontend gets it automatically via `invoke()` or MCP

No need to wire up separate state sync for each interface.

---

## MCP Server

### Two deployment modes

1. **In-process Tauri plugin** (`crates/mcp/`) — Shares `AppState` in memory. Mutations are instant. GUI updates immediately.

2. **Standalone binary** (`crates/mcp-server/`) — Reads/writes JSON files directly. For use outside Tauri (e.g., Claude Code, OpenCode CLI). Uses `AIAW_SESSION_ID` env var or CWD matching to find the right session.

### 19 MCP tools

| Group | Tools |
|-------|-------|
| Session | `current_session_info`, `session_list`, `session_create`, `session_rename`, `session_delete`, `session_open`, `session_close` |
| Template | `template_list`, `template_save`, `template_delete`, `template_rename` |
| Workspace | `workspace_list`, `workspace_get_active`, `workspace_add`, `workspace_remove`, `workspace_rename`, `workspace_set_active`, `workspace_update_tree`, `workspace_reset` |

### Error mapping (`crates/mcp/src/error.rs`)

| MCP error code | Meaning |
|----------------|---------|
| `-32001` | Not found |
| `-32002` | Already exists |
| `-32602` | Invalid input |
| `-32000` | Other |

### Session resolution (`crates/mcp/src/session_resolution.rs`)

Priority: `AIAW_SESSION_ID` env var → CWD-based registry match → error. Handles ambiguous matches when multiple sessions share a directory.

---

## GUI / Frontend

### Component tree

```
App
├── ToastProvider
│   └── SessionProvider
│       ├── SessionSidebar (left panel: session CRUD, grouping, context menus)
│       └── MainArea
│           ├── LayoutTabs (workspace tab bar: add/rename/close/reset/save-as-template)
│           └── SplitLayout (recursive tree renderer using allotment)
│               └── PanelContext.Provider
│                   └── TerminalPanel | BlankPanel
├── KeyboardShortcutsHandler
└── ToastContainer
```

### Panel registry (plugin system) — `src/panelRegistry.tsx`

New panel types are added by calling `registerPanel(type, label, component)`. Currently registered:
- `"terminal"` → TerminalPanel
- `"blank"` → BlankPanel

### Layout tree structure

The UI layout is a recursive tree persisted as JSON:

```typescript
type LayoutNode =
  | { split: { direction: "horizontal" | "vertical"; ratio: number; children: LayoutNode[] } }
  | { panel: { panel_type: string } }
```

Splits render recursively with `allotment`. Panel type strings map to React components via the panel registry.

### Key frontend files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root layout, workspace management, keyboard shortcuts |
| `src/SessionSidebar.tsx` | Session list, CRUD, directory grouping, context menus |
| `src/SplitLayout.tsx` | Recursive split pane renderer, drag-to-split/join |
| `src/TerminalPanel.tsx` | xterm.js integration, PTY connection, terminal caching |
| `src/LayoutTabs.tsx` | Workspace tab bar |
| `src/panelRegistry.tsx` | Panel type → component registry |
| `src/SessionContext.tsx` | React Context providing sessions/activeSession |
| `src/PanelContext.tsx` | React Context for workspace/session/path/terminalId |

---

## PTY (Terminal) System

**File:** `src-tauri/src/pty.rs`

- `PtyStore` holds `HashMap<String, PtyHandle>` (terminal_id → handle)
- Each `PtyHandle`: child process + master PTY fd + writer + reader thread
- Reader thread emits `pty-output` events; on EOF emits `pty-exit`
- `pty_spawn` is idempotent by terminal_id
- Injects `AIAW_SESSION_ID` into shell env (so MCP inside the terminal knows which session it's in)
- Shell is configurable via preferences (default: `$SHELL`, can be `claude`, `codex`, etc.)
- **Terminal identity is UUID-decoupled from layout path** — terminals survive layout rearrangements

---

## State Management

### Rust backend

`AppState` in `crates/commands/src/state.rs`:
```rust
struct AppState {
    sessions: Arc<Mutex<SessionRegistry>>,
    layouts: Arc<Mutex<LayoutStore>>,
}
```

Canonical lock ordering: sessions first, then layouts (prevents deadlocks).

### Persistence

| Data | File |
|------|------|
| Sessions | `~/Library/Application Support/AI Agent Workspace/sessions.json` |
| Layouts | `~/Library/Application Support/AI Agent Workspace/layouts.json` |
| Preferences | `~/Library/Application Support/AI Agent Workspace/preferences.json` (via `@tauri-apps/plugin-store`) |

Atomic writes via temp file + rename.

### File watcher

`notify::RecommendedWatcher` watches the app data directory. When external processes (CLI/MCP server) write files, the watcher reloads state and emits events to the frontend.

### React state

No Redux/Zustand/MobX. State is managed via:
- `SessionContext` — sessions, activeSession, sidebar state
- `ToastContext` — toast notifications
- `PanelContext` — per-panel workspace/session/path/terminalId
- `useWorkspaceManager` — workspace tab state (local to MainArea)
- Direct `invoke()` calls to Tauri + `useTauriEvent` for auto-refresh

---

## Event System

| Event | Emitter | Listener |
|-------|---------|----------|
| `sessions-changed` | File watcher, MCP plugin, Tauri commands | SessionContext, App |
| `layouts-changed` | File watcher, MCP plugin | MainArea |
| `pty-output` | PTY reader thread | TerminalPanel xterm |
| `pty-exit` | PTY reader thread | TerminalPanel restart UI |

---

## Multi-Window

Two separate Tauri webview windows:
1. **Main window** — The app itself
2. **Preferences window** (`preferences.html` / `src/preferences-main.tsx`) — External tools config, danger zone

---

## Extension Points

| What | How |
|------|-----|
| New panel type | `registerPanel(type, label, component)` in `src/panelRegistry.tsx` |
| New MCP tool | Add variant to `McpHandler` in `crates/mcp/src/lib.rs` |
| New command | Add variant to `Command` enum, handle in `execute()`, add Tauri handler |
| New Tauri command | Add `#[tauri::command]` or use `command_handler!` macro in `src-tauri/src/lib.rs` |
| New preference | Add to `preferences.html` / `src/preferences-main.tsx` |

---

## File Layout

```
ai-agent-workspace/
├── src/                          # React frontend
│   ├── App.tsx                   # Root component
│   ├── SessionSidebar.tsx        # Session list panel
│   ├── SplitLayout.tsx           # Recursive split renderer
│   ├── TerminalPanel.tsx         # xterm.js terminal
│   ├── LayoutTabs.tsx            # Workspace tabs
│   ├── panelRegistry.tsx         # Panel plugin registry
│   ├── SessionContext.tsx         # Session React Context
│   ├── PanelContext.tsx           # Panel React Context
│   ├── hooks/                    # useTauriEvent, useEventListener, etc.
│   ├── utils/                    # layoutTreeUtils, pathUtils, migrateTree
│   └── components/               # Dialog, ConfirmDialog, ErrorBoundary
├── src-tauri/                    # Tauri Rust backend
│   ├── src/main.rs               # Binary entry
│   ├── src/lib.rs                # Plugin setup, command handlers, file watcher
│   ├── src/pty.rs                # PTY management
│   └── tauri.conf.json           # Tauri config
├── crates/
│   ├── core/                     # Domain models (SessionRegistry, LayoutStore)
│   ├── commands/                 # Command enum, executor, state, errors
│   ├── mcp/                      # MCP Tauri plugin (in-process, 19 tools)
│   └── mcp-server/               # Standalone MCP server binary
├── IDEAS.md                      # Vision doc (whiteboard, event sourcing, etc.)
├── PRD.md                        # MCP Server v1 PRD
├── tasks.json                    # Task tracker (14 tasks, all complete)
└── .aw/                          # Domain glossary, ADRs, progress
```

---

## Vision / Ideas (from `IDEA.md`)

The original vision doc describes several planned capabilities:
- **Whiteboard system** — collaborative canvas for diagrams
- **Event sourcing** — immutable event log for state changes (partially realized via file watcher + atomic writes)
- **Plugin architecture** — more panel types beyond terminal
- **Multi-process coordination** — CLI/GUI/MCP real-time sync (largely achieved via file watcher)

---

*Generated from codebase exploration — June 2026*
