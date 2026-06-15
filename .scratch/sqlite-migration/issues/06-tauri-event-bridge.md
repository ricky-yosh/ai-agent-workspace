Status: ready-for-agent

# 06: Tauri Event Bridge — DomainEvent to Tauri Events

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

In `src-tauri/src/lib.rs`, after each `execute()` call, iterate `outcome.events` and emit Tauri events:

- `DomainEvent::SessionsChanged` → `app.emit("sessions-changed", ())`
- `DomainEvent::LayoutsChanged` → `app.emit("layouts-changed", ())`
- `DomainEvent::WorkspaceChanged { .. }` → `app.emit("sessions-changed", ())` (frontend compatibility — the React frontend listens for `"sessions-changed"` to refresh workspace state)

This replaces the file watcher's event emission. The mapping logic should be a small helper function, not inline in each Tauri command handler.

The frontend React code requires zero changes — it already listens for `"sessions-changed"` and `"layouts-changed"`.

## Acceptance criteria

- [ ] After `execute()`, Tauri events are emitted based on `outcome.events`
- [ ] `SessionsChanged` emits `"sessions-changed"`
- [ ] `LayoutsChanged` emits `"layouts-changed"`
- [ ] `WorkspaceChanged` emits `"sessions-changed"` for frontend compatibility
- [ ] The mapping is in a shared helper function, not duplicated across handlers
- [ ] Frontend behavior is unchanged (no React code modifications needed)

## Blocked by

- 05-execution-outcome-domain-events
