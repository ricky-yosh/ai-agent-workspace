# 01: PTY backend — spawn, write, read, resize

Status: ready-for-agent

## Parent

PRD: `.scratch/terminal-panel-pty/PRD.md`

## What to build

Add the Rust-side PTY infrastructure. This covers the `portable-pty` backend, the PTY store, and four Tauri commands that the frontend will call.

End-to-end behavior: a caller invokes `pty_spawn(workspace_id, path)` and gets back a UUID. The PTY process starts in the session's working directory with `AIAW_SESSION_ID` injected. Output arrives via `pty-output` Tauri events. The caller writes input via `pty_write` and resizes the terminal via `pty_resize`.

PTY store type: `Mutex<HashMap<(WorkspaceId, Vec<usize>), PtyHandle>>` managed via `app.manage()`. Key is `(workspace_id, path)` — the panel's position in the layout tree. No data model changes to the layout tree.

### Tauri commands

- `pty_spawn(workspace_id, path)` → `{ ptyId }` — spawns a new PTY. Reads `pty_command` from Preferences (or falls back to `$SHELL`). Injects `AIAW_SESSION_ID` from the session resolved by `workspace_id`. Sets `cwd` to the session's `workingDirectory`. Panics/errors if Preferences are unreadable or the command can't spawn (surface via Result).
- `pty_write(ptyId, data)` — writes bytes to the PTY master.
- `pty_resize(ptyId, cols, rows)` — resizes the PTY.

### Background read thread

A dedicated thread per PTY reads from the PTY master in a loop. On data, emits `app.emit("pty-output", PtyOutputPayload { pty_id, data })`. On process exit (read returns 0), the thread exits.

### Module

All PTY logic lives in `src-tauri/src/pty.rs`. Commands are registered in `src-tauri/src/lib.rs`.

## Acceptance criteria

- [ ] `pty_spawn` returns a UUID and the process is running
- [ ] PTY spawns in the correct working directory (verify via `pwd` output)
- [ ] `AIAW_SESSION_ID` is set in the PTY environment (verify via `echo $AIAW_SESSION_ID`)
- [ ] `pty_write` sends data to the PTY (verify shell echoes it back via `pty-output`)
- [ ] `pty-output` events fire with correct `ptyId` and data
- [ ] `pty_resize` changes the PTY dimensions (verify via `stty size`)
- [ ] `portable-pty` is the only new Rust dependency
- [ ] Tests exercise Tauri command contracts (not internal struct fields)

## Blocked by

None — can start immediately.
