# ADR 0002: Store All Session State in App Support Directory

## Status

Accepted (file watcher consequence superseded by ADR 0010)

## Context

The initial design placed per-session state files (`state.json`, `board.json`, `events.jsonl`) in a `.ai-workspace-cache/` directory at the repository root. This required file watchers (kqueue/inotify) so the app could detect external writes from the CLI or other windows. It also introduced session reachability problems — if the working directory was deleted or moved, session state became orphaned.

An alternative was considered: store all session state in `~/Library/Application Support/AI Agent Workspace/` (macOS), with the CLI communicating via Tauri IPC (see ADR 0001) instead of writing files directly. This eliminates the file watcher layer, removes all repo-side artifacts, and makes the CLI a proper adapter over the Command Layer.

## Decision

All session state — the registry (`sessions.json`), per-session state, event-log.jsonl, and artifacts — lives in the platform-appropriate app support directory. Nothing is written to the repository.

The CLI sends Commands to the app via Tauri IPC rather than writing state files directly. This preserves the Command Layer as the single mutation path for all interfaces.

> **Note (see ADR 0010):** The "CLI via IPC, no file watchers" approach below was reversed. The CLI is a fully separate process that writes `sessions.json`/`layouts.json` directly through the Command Layer/core, and the GUI uses a file watcher to detect those changes and reload. The app-support-directory location and "nothing written to the repo" decisions remain unchanged.

## Consequences

- Positive: No `.ai-workspace-cache/` directory in user repositories. Clean repos, no .gitignore management.
- ~~Positive: No file watchers needed — eliminates an entire class of bugs (race conditions, partial writes, watcher lifecycle).~~ Superseded by ADR 0010 — a file watcher was reintroduced for CLI/standalone-MCP-to-GUI sync.
- Positive: CLI becomes a proper Command Layer adapter, consistent with UI and MCP servers (in the sense of dispatching through `commands`/`core`, not via Tauri IPC).
- Positive: Session state survives repo deletion/movement (the session appears as "missing" in the sidebar but can be relocated).
- Negative: Session state is not portable between machines (no sync via git). If portability becomes important, export/import can be added later.
- Negative: Session state is not embedded alongside the project for archival purposes.
