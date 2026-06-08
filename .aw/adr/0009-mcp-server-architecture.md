# ADR 0009: Monolithic In-Process MCP Server

## Status

Accepted

## Context

The app needs to expose two classes of capability to AI agents via MCP: workspace manipulation (create sessions, place Cards/Edges on the whiteboard, manage artifacts) and codebase intelligence (tree-sitter symbol extraction, LSP references, `build_code_map` for structural code graphs).

We considered splitting these across separate MCP servers — **Workspace MCP** in-process and **Codebase MCP** as a standalone binary — with the agent orchestrating calls between them. This decomposed cleanly by responsibility but introduced several problems:

- The `build_code_map` flow (parse code structure → calculate layout → place Cards/Edges on whiteboard) required cross-server coordination. The idiomatic MCP approach (host/agent orchestrates) wastes agent tokens on a mechanical loop. The non-idiomatic approach (server connects to another server as a client) violates the MCP spec's design principle #3 — *"Servers should not be able to read the whole conversation, nor 'see into' other servers."*

- Session orientation (`AIAW_SESSION_ID` env var) had to be answered differently for each server: Workspace MCP clearly needs it, but does Codebase MCP? Does it just use `cwd`?

- Two deployment artifacts, two sets of tools for the agent to discover, two connection lifecycles.

### Decision

**One monolithic MCP server running in-process as a Tauri plugin.** All tools — workspace manipulation and codebase intelligence — live in a single server that holds a reference to `AppState`.

### Why monolithic?

| Concern | Resolution |
|---|---|
| Cross-server coordination | Eliminated. `build_code_map` is one tool that internally queries tree-sitter/LSP, runs ELK layout, and calls `execute(CreateCard)` / `execute(CreateEdge)` — all in one call stack. |
| Non-idiomatic proxy pattern | Avoided. No server-as-client needed. |
| Session orientation | One server, one `AIAW_SESSION_ID` — trivial. |
| Tool namespace pollution | Tools use prefix conventions (`codebase.find_symbol`, `workspace.create_card`). Well-written tool descriptions guide the agent. |
| LSP queries blocking GUI | Heavy work runs on `tokio::task::spawn_blocking` — the Tauri event loop stays responsive. |
| Standalone codebase MCP unavailable | Acceptable. Codebase intelligence is a feature of the app, not a standalone service. If the app isn't running, there's no whiteboard to place results on. |

### Session Orientation

When the app spawns a Terminal Panel's PTY for a Session, it injects an `AIAW_SESSION_ID` environment variable (the Session's UUID) into that shell. Any stdio-based MCP server launched as a child process from within that shell inherits the variable and uses it to attribute Commands to the correct Session — no filesystem lookups or explicit arguments required.

### Architecture

```
┌──────────────────────────────────────────────────────┐
│  Tauri App Process                                   │
│                                                      │
│  ┌─────────────┐  ┌───────────────────────────────┐  │
│  │ GUI (React) │  │ MCP Server (in-process plugin) │  │
│  │             │  │                                │  │
│  │  listen()   │  │  Workspace tools:              │  │
│  │             │  │    create_card, create_edge,   │  │
│  └──────┬──────┘  │    create_session, ...         │  │
│         │         │                                │  │
│         ▼         │  Codebase tools:               │  │
│  ┌────────────┐   │    find_symbol, find_references│  │
│  │  Command   │◄──│    build_code_map, ...         │  │
│  │  Layer     │   │                                │  │
│  └─────┬──────┘   │  Transports:                   │  │
│        │          │    stdio (local agents)         │  │
│        ▼          │    TCP (remote agents)          │  │
│  ┌────────────┐   └───────────────────────────────┘  │
│  │  AppState  │                                      │
│  └────────────┘                                      │
└──────────────────────────────────────────────────────┘
```

Both MCP and GUI share the same `AppState` in memory. MCP calls `execute()` directly — no file I/O, no serialization, no cross-process communication. After each mutation, the MCP plugin calls `app.emit("state-changed", ())` and the frontend refreshes.

## Consequences

- MCP has near-zero latency for state changes — direct Mutex access and event emit.
- No cross-server coordination problems — `build_code_map` is one tool, one call stack.
- No non-idiomatic server-as-client patterns — clean MCP spec compliance.
- Single deployment artifact — the MCP runs inside the Tauri app.
- LSP/tree-sitter CPU work offloaded to background threads via `tokio::task::spawn_blocking`.
- If the Tauri app is not running, the MCP is unavailable — acceptable since its purpose is to manipulate the workspace the user is looking at.
- Tool namespace uses prefixes to avoid pollution (`codebase.*`, `workspace.*`).
- Session orientation is automatic via `AIAW_SESSION_ID` env var — no explicit session arguments from the agent.
