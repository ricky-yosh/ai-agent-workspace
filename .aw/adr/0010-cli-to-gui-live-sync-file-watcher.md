# ADR 0010: CLI-to-GUI Live Sync via File Watcher

## Status

Accepted (amends ADR 0002's "no file watchers needed" consequence)

## Context

The CLI (`aiaws`) runs as a separate process from the Tauri app. When the CLI modifies state (creates a session, deletes a template, etc.), the Tauri app's in-memory `Mutex<SessionRegistry>` is stale — it loaded from disk at startup and only updates through its own commands. The user wants CLI changes to appear in the GUI without restarting the app.

Options considered:

A) **No sync** — CLI and GUI are independent. User must restart the GUI to see CLI changes. Simple but poor UX.

B) **File watcher** — Tauri watches `sessions.json` and `layouts.json` for external changes. On change, reloads state into the Mutex and emits a Tauri event to the frontend.

C) **IPC** — CLI sends a notification to the Tauri app via Unix socket or named pipe after mutations. More complex, requires the Tauri app to run an IPC server.

## Decision

**Option B — File watcher.**

The Tauri app uses the `notify` crate to watch `sessions.json` and `layouts.json` for external modifications. When a file changes, the app reloads the corresponding store into the Mutex and emits a `state-changed` event to the frontend. The frontend listens for this event and refreshes its data.

### Why file watcher?

- Reuses existing infrastructure — no new IPC protocol to design.
- CLI stays a clean standalone binary — no Tauri dependency, no IPC client code.
- Atomic writes (write to temp file, then rename) prevent corruption.
- The `notify` crate is mature and widely used in the Rust ecosystem.

### Flow

```
CLI writes sessions.json (atomic: temp file + rename)
       ↓
notify watcher detects file change
       ↓
Tauri reloads SessionRegistry from disk
       ↓
app.emit("state-changed", ())
       ↓
Frontend listener fires → refreshSessions()
       ↓
GUI updates
```

### Trade-offs accepted

- Latency: file watcher introduces a small delay (milliseconds) compared to in-process direct access. Acceptable for CLI use cases where the developer is not expecting instant updates.
- File I/O: every CLI mutation triggers a disk read in the Tauri process. Minimal overhead for occasional CLI commands.
- Race conditions: safe because core uses atomic writes (temp file + rename). The watcher only fires after the write completes.

## Consequences

- CLI changes appear in the GUI within milliseconds of the file write.
- No changes needed to the CLI binary — it already writes to the JSON files.
- The `notify` crate is added as a dependency to `src-tauri`.
- The Tauri app watches two files (`sessions.json`, `layouts.json`) on startup.
- Frontend adds `listen("state-changed", ...)` handlers in `SessionContext` and `App.tsx`.
- If the Tauri app is not running when the CLI writes, the changes are picked up on next launch (state loads from disk at startup).
