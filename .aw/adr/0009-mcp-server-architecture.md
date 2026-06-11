# ADR 0009: Monolithic MCP Server with Standalone Binary

## Status

Accepted

## Context

The app needs to expose two classes of capability to AI agents via MCP: workspace manipulation (create sessions, place Cards/Edges on the whiteboard, manage artifacts) and codebase intelligence (tree-sitter symbol extraction, LSP references, `build_code_map` for structural code graphs).

We considered splitting these across separate MCP servers — **Workspace MCP** in-process and **Codebase MCP** as a standalone binary — with the agent orchestrating calls between them. This decomposed cleanly by responsibility but introduced several problems:

- The `build_code_map` flow (parse code structure → calculate layout → place Cards/Edges on whiteboard) required cross-server coordination. The idiomatic MCP approach (host/agent orchestrates) wastes agent tokens on a mechanical loop. The non-idiomatic approach (server connects to another server as a client) violates the MCP spec's design principle #3 — *"Servers should not be able to read the whole conversation, nor 'see into' other servers."*

- Session orientation (`AIAW_SESSION_ID` env var) had to be answered differently for each server: Workspace MCP clearly needs it, but does Codebase MCP? Does it just use `cwd`?

- Two deployment artifacts, two sets of tools for the agent to discover, two connection lifecycles.

### Decision

**One monolithic MCP server shipped in two modes:**

1. **Embedded** — as a Tauri plugin inside the GUI process. Shares `AppState` in memory. Emits Tauri events for live UI refresh.
2. **Standalone binary** (`aiaw-mcp-server`) — a separate process that reads/writes App Support Dir directly. No GUI dependency. Clients connect via stdio subprocess (`claude mcp add aiaws -- aiaw-mcp-server`).

Both modes use the same `McpHandler` with the same 18 tools. The handler is decoupled from Tauri via callback fields:

```rust
pub struct McpHandler {
    pub sessions: Arc<Mutex<SessionRegistry>>,
    pub layouts: Arc<Mutex<LayoutStore>>,
    pub on_session_changed: Option<Arc<dyn Fn() + Send + Sync>>,
    pub on_layouts_changed: Option<Arc<dyn Fn() + Send + Sync>>,
}
```

- **Embedded mode**: `init()` constructs callbacks that call `app.emit("sessions-changed", ())` / `app.emit("layouts-changed", ())`. The `tauri-integration` feature flag gates the plugin.
- **Standalone mode**: Callbacks are `None`. No Tauri compiled. The GUI's file watcher detects state changes from App Support Dir.

### Why monolithic?

| Concern | Resolution |
|---|---|
| Cross-server coordination | Eliminated. `build_code_map` is one tool that internally queries tree-sitter/LSP, runs ELK layout, and calls `execute(CreateCard)` / `execute(CreateEdge)` — all in one call stack. |
| Non-idiomatic proxy pattern | Avoided. No server-as-client needed. |
| Session orientation | One server, one `AIAW_SESSION_ID` — trivial. |
| Tool namespace pollution | Tools use prefix conventions (`codebase.find_symbol`, `workspace.create_card`). Well-written tool descriptions guide the agent. |
| LSP queries blocking GUI | Heavy work runs on `tokio::task::spawn_blocking` — the Tauri event loop stays responsive. |
| AI tool connectivity | Standalone binary uses standard stdio subprocess — identical to every reference MCP server in the ecosystem. |

### Session Orientation

When the app spawns a Terminal Panel's PTY for a Session, it injects an `AIAW_SESSION_ID` environment variable (the Session's UUID) into that shell. The standalone `aiaw-mcp-server` binary, when launched as a child process from within that shell, inherits the variable and uses it to attribute workspace Commands to the correct Session — no filesystem lookups or explicit arguments required.

### Architecture

```
┌────────────── Embedded Mode (Tauri plugin) ─────────────┐
│                                                           │
│  ┌─────────────┐  ┌───────────────────────────────────┐  │
│  │ GUI (React) │  │ MCP Server (in-process)            │  │
│  │             │  │                                    │  │
│  │  listen()   │  │  18 tools → Command Layer → core   │  │
│  └──────┬──────┘  │                                    │  │
│         │         │  on_session_changed ──► app.emit() │  │
│         ▼         │  on_layouts_changed ──► app.emit() │  │
│  ┌────────────┐   └───────────────────────────────────┘  │
│  │  AppState  │◄── in-memory shared state                │
│  └─────┬──────┘                                          │
│        │                                                 │
└────────┼─────────────────────────────────────────────────┘
         │
         ▼  reads/writes
┌────────┴─────────────────────────────────────────────────┐
│              App Support Dir                              │
│  sessions.json  │  layouts.json  │  event-log.jsonl       │
└────────┬─────────────────────────────────────────────────┘
         ▲  reads/writes
         │
┌────────┴────── Standalone Mode (binary) ─────────────────┐
│                                                           │
│  AI Tool (Claude Code, Codex, Cursor)                     │
│    │                                                      │
│    │  spawns aiaw-mcp-server as stdio subprocess          │
│    ▼                                                      │
│  ┌───────────────────────────────────────────────────┐   │
│  │ aiaw-mcp-server                                   │   │
│  │                                                    │   │
│  │  18 tools → Command Layer → core (file I/O)        │   │
│  │  Inherits AIAW_SESSION_ID from parent shell         │   │
│  │  on_session_changed = None (no GUI to notify)       │   │
│  └───────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### Crate structure

Extends the workspace structure from ADR 0007 (`core`, `commands`, `cli`) with two additional crates:

```
crates/mcp/          Library crate (handler + optional Tauri plugin)
  ├── lib.rs          McpHandler, init() behind feature flag
  ├── error.rs        CommandError → MCP error mapping
  └── Cargo.toml      tauri = optional, default = ["tauri-integration"]

crates/mcp-server/   Standalone binary crate
  ├── main.rs         Construct handler, serve stdio, no Tauri
  └── Cargo.toml      mcp { default-features = false }
```

## Consequences

- **Dual deployment**: Embedded for GUI users, standalone for AI tool CLI users. Same tools, same state files.
- **No Tauri in binary**: Standalone binary has zero Tauri symbols — 8.6MB, slim dependency tree.
- **Callback decoupling**: `McpHandler` uses `Option<Arc<dyn Fn() + Send + Sync>>` for event emission, not `AppHandle`. Any consumer can provide their own notification mechanism.
- **File-based coordination**: GUI file watcher detects standalone binary's writes. No cross-process IPC needed.
- **Standard MCP pattern**: `claude mcp add aiaws -- aiaw-mcp-server` — identical to how every other MCP server is configured.
- **Session orientation**: Unchanged — `AIAW_SESSION_ID` env var flows through PTY to subprocess automatically.
- **No cross-server coordination** — `build_code_map` is one tool, one call stack.
- **Tool namespace** uses prefixes to avoid pollution (`codebase.*`, `workspace.*`).
- LSP/tree-sitter CPU work offloaded to background threads via `tokio::task::spawn_blocking`.
- The embedded in-process MCP has **near-zero latency** for state changes — direct Mutex access and event emit.
