# ADR 0021: Decouple PTY Identity from Layout Path

## Status

Accepted

## Context

The terminal system keyed PTYs by `PtyKey { workspace_id, path: Vec<usize> }`, tying backend process identity to frontend layout position. When a user joins or splits panels, layout paths change, so the backend orphaned and killed PTYs — producing "stacking" (layered xterm DOM) and "resetting" (session loss) bugs. Six targeted fixes did not remove the underlying coupling, and any future layout feature (drag-drop, reorder) would resurrect the same class of bugs. Ghostty, VS Code, iTerm2, and Tmux all avoid this by decoupling the PTY session (Model) from the layout tree (View), keying PTYs by a stable UUID instead of a path.

## Decision

Key PTYs by a stable `terminal_id` (UUID) on terminal leaf nodes rather than by layout path. The frontend generates the ID and owns terminal lifecycle (spawn on split, kill on join, reconnect on mount); the backend is a dumb pool that only kills on explicit `pty_kill(terminal_id)` and never auto-detects orphans. `pty_spawn` is idempotent by ID. On shell exit the backend emits `pty-exit` and the frontend shows a "Process Exited" panel the user re-spawns from. Persisted trees migrate to add `terminal_id` on boot. Executed as a focused big-bang refactor, no incremental translation layer.

## Consequences

- Eliminates the entire class of path-synchronization bugs (orphan detection, races, zombie handles).
- Future layout features (drag-drop, reorder) only change tree structure; PTY identity is untouched.
- Breaking change to the persisted format — requires a boot migration.
- Backend simplifies to a dumb pool; the frontend owns more lifecycle responsibility.
- Stale reader threads are harmless post-decoupling — no cleanup mechanism needed.
