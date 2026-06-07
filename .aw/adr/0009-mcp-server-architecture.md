# ADR 0009: MCP Server Architecture — In-Process Tauri Plugin

## Status

Accepted

## Context

The MCP server lets AI agents (Claude Code, Codex, etc.) manipulate workspace state — create sessions, add workspaces, update layout trees. The user needs to see these changes reflected in the GUI in real time as the AI agent works.

We considered how the MCP server should communicate with the Tauri app:

A) **Separate process with file watcher** — MCP runs as a standalone binary (like the CLI), writes to JSON files, Tauri watches for changes and reloads. Consistent with the CLI approach.

B) **In-process Tauri plugin** — MCP runs within the Tauri app process as a plugin or background thread. Holds a reference to the same `Mutex<SessionRegistry>`. After mutations, emits Tauri events directly to the frontend.

## Decision

**Option B — In-process Tauri plugin.**

The MCP server runs within the Tauri app process. It exposes tools via stdio (for local AI agents) or TCP (for remote agents). Each tool call constructs a `Command` variant, calls `execute()`, and emits a Tauri event to the frontend.

### Why not file watcher for MCP?

| | CLI (file watcher) | MCP (in-process) |
|---|---|---|
| Update frequency | Occasional | Rapid, continuous |
| Latency tolerance | Seconds is fine | Needs to feel instant |
| Who's watching | Developer in terminal | User watching GUI |
| Independence | Must run standalone | Tightly coupled to app |

The MCP is called by an AI agent that's actively working. The user watches the GUI and expects each step — "create session, add workspace, update tree" — to appear immediately. File watcher introduces unnecessary latency and disk I/O during rapid mutations.

### Architecture

```
┌─────────────────────────────────────────────┐
│  Tauri App Process                          │
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ GUI (React) │  │ MCP Server (plugin)  │  │
│  │             │  │ - stdio for local AI │  │
│  │  listen()   │  │ - TCP for remote AI  │  │
│  └──────┬──────┘  └──────────┬───────────┘  │
│         │                    │              │
│         ▼                    ▼              │
│  ┌─────────────────────────────────────┐    │
│  │     Command Layer (execute)         │    │
│  └─────────────────────────────────────┘    │
│                    │                        │
│                    ▼                        │
│  ┌─────────────────────────────────────┐    │
│  │  AppState (Mutex<SessionRegistry>)  │    │
│  └─────────────────────────────────────┘    │
│                    │                        │
│         app.emit("state-changed")          │
│                    ▼                        │
│              GUI refreshes                  │
└─────────────────────────────────────────────┘
```

Both MCP and GUI share the same `AppState` in memory. MCP calls `execute()` directly — no file I/O, no serialization, no cross-process communication. After each mutation, the MCP plugin calls `app.emit("state-changed", ())` and the frontend refreshes.

The CLI remains a separate process with file watcher for GUI sync (see ADR 0010).

## Consequences

- MCP has near-zero latency for state changes — direct Mutex access and event emit.
- No file I/O overhead during rapid AI agent iterations.
- MCP cannot run independently of the Tauri app — it requires the app process to be running.
- MCP tools map 1:1 to `Command` variants, same as Tauri IPC commands and CLI subcommands.
- Adding a new MCP tool means adding a new `Command` variant and a thin adapter function.
- Local AI agents connect via stdio (standard MCP transport). Remote agents connect via TCP.
- If the Tauri app is not running, the MCP is unavailable — but this is acceptable since the MCP's purpose is to manipulate the workspace the user is looking at.
