# ADR 0002: Store All Session State in App Support Directory

## Status

Accepted (file watcher consequence superseded — see Note below)

## Context

The initial design placed per-session state files (`state.json`, `board.json`, `events.jsonl`) in a `.ai-workspace-cache/` directory at the repository root. This required file watchers (kqueue/inotify) so the app could detect external writes from other windows or processes. It also introduced session reachability problems — if the working directory was deleted or moved, session state became orphaned.

An alternative was considered: store all session state in `~/Library/Application Support/AI Agent Workspace/` (macOS) instead of writing files directly to the repo. This eliminates the file watcher layer and removes all repo-side artifacts.

## Decision

All session state — the registry (`sessions.json`), per-session state, event-log.jsonl, and artifacts — lives in the platform-appropriate app support directory. Nothing is written to the repository.

> **Note:** The "no file watchers needed" consequence below was later reversed. The standalone MCP server (`aiaw-mcp-server`) is a separate process that writes `sessions.json`/`layouts.json` directly through the Command Layer/core, and the GUI uses a file watcher to detect those changes and reload. The app-support-directory location and "nothing written to the repo" decisions remain unchanged.

## Consequences

- Positive: No `.ai-workspace-cache/` directory in user repositories. Clean repos, no .gitignore management.
- ~~Positive: No file watchers needed — eliminates an entire class of bugs (race conditions, partial writes, watcher lifecycle).~~ Superseded — a file watcher was reintroduced for standalone-MCP-to-GUI sync.
- Positive: Session state survives repo deletion/movement (the session appears as "missing" in the sidebar but can be relocated).
- Negative: Session state is not portable between machines (no sync via git). If portability becomes important, export/import can be added later.
- Negative: Session state is not embedded alongside the project for archival purposes.
