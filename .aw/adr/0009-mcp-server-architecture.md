# ADR 0009: Monolithic MCP Server with Standalone Binary

## Status

Accepted

## Context

The app exposes two classes of capability to AI agents via MCP: workspace manipulation (sessions, Nodes/Edges on the Visual Canvas, artifacts) and codebase intelligence (tree-sitter symbols, LSP references, `build_code_map`). Splitting these into separate Workspace and Codebase MCP servers decomposed cleanly by responsibility but broke down on coordination: `build_code_map` (parse structure → lay out → place Nodes/Edges) would span both servers. The idiomatic fix (agent orchestrates) burns agent tokens on a mechanical loop; the non-idiomatic fix (server acting as a client of another server) violates MCP design principle #3 ("servers should not see into other servers"). Two servers also meant two deployment artifacts, two tool namespaces, and an ambiguous `AIAW_SESSION_ID` story.

## Decision

Ship **one monolithic MCP server (`McpHandler`, one tool set) in two modes**:

1. **Embedded** — a Tauri plugin in the GUI process, sharing `AppState` in memory and emitting Tauri events for live UI refresh.
2. **Standalone binary** (`aiaw-mcp-server`) — a separate process that reads/writes the App Support Dir directly, with no GUI dependency, connected over a stdio subprocess (`claude mcp add aiaws -- aiaw-mcp-server`).

The handler is decoupled from Tauri via optional callback fields (`Option<Arc<dyn Fn()...>>`) rather than an `AppHandle`: embedded mode wires them to `app.emit(...)` behind a `tauri-integration` feature flag; standalone mode leaves them `None` and relies on the GUI's file watcher to notice its writes. This keeps `build_code_map` a single in-process call stack (no cross-server proxy), gives one unambiguous `AIAW_SESSION_ID`, and lets tool-namespace prefixes (`codebase.*`, `workspace.*`) prevent collisions. Heavy LSP/tree-sitter work runs on `tokio::task::spawn_blocking` so the event loop stays responsive.

## Consequences

- Dual deployment from one codebase: same tools and same state files for GUI and CLI users.
- The standalone binary carries zero Tauri symbols (slim dependency tree).
- Coordination is file-based (GUI file watcher sees the binary's writes); no cross-process IPC.
- Embedded mode has near-zero state-change latency (direct shared state + event emit); standalone pays a file-watch round-trip.
- `AIAW_SESSION_ID` flows from the Terminal Panel's PTY into any subprocess launched there, attributing Commands to the right Session automatically (see [ADR 0011](0011-mcp-standalone-session-resolution-fallback.md) for the fallback).
