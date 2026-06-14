# ADR 0001: Decouple PTY Identity from Layout Path

## Status

Accepted

## Context

The terminal system keys PTYs by `PtyKey { workspace_id, path: Vec<usize> }`, tying backend process identity to frontend layout position. When a user joins or splits panels, layout paths change, causing the backend to orphan and kill PTYs — producing "stacking" (layered xterm DOM) and "resetting" (session loss) bugs.

Six targeted fixes were attempted (removed relocation, await cleanup, panel identity key, etc.) but the fundamental coupling remains. Any future layout feature (drag-drop, reorder) would resurrect the same class of bugs.

The REVIEW analysis recommends the pattern used by Ghostty, VS Code, iTerm2, and Tmux: decoupling the PTY session (Model) from the layout tree (View) by using UUIDs instead of paths as PTY keys.

## Decision

Decouple PTY identity from layout paths by:

1. Adding `terminal_id: string` (UUID) to terminal leaf nodes in `LayoutNode`.
2. Changing `PtyStore` from `HashMap<PtyKey, PtyHandle>` to `HashMap<String, PtyHandle>` keyed by `terminal_id`.
3. Deleting `cleanup_orphaned_ptys` — the backend only kills PTYs on explicit `pty_kill(terminal_id)`.
4. The frontend owns terminal lifecycle: spawn on split, kill on join-consume, reconnect on mount.
5. Persisted `sessions.json` gains `terminal_id` on terminal nodes. Migration generates UUIDs for old trees on boot.
6. Frontend generates and provides `terminal_id` to `pty_spawn` — backend accepts the ID, does not generate it.
7. `pty_spawn` is idempotent by `terminal_id`: returns existing handle if alive, removes stale handle and spawns fresh if dead.
8. Backend emits `pty-exit` (not `pty-restart`) on shell exit. Frontend transitions panel to "Process Exited" interstitial — user presses key to re-spawn.
9. Splits: optimistic tree update — generate UUID, insert node, render loading panel; mounting `useEffect` invokes `pty_spawn`.
10. Joins: fire-and-forget — drop node from tree immediately, then call `pty_kill(droppedTerminalId)` afterward.

Execute as a focused big-bang refactor on a branch — no incremental translation layer.

## Consequences

- Eliminates the entire class of path-synchronization bugs (orphan detection, race conditions, zombie handles).
- Future layout features (drag-drop, reorder) are trivial — only tree structure changes, PTY identity is untouched.
- Breaking change to persisted format — requires migration function on app boot.
- Backend becomes simpler (dumb PTY pool) but frontend gains more responsibility for lifecycle management.
- `handle_pty_exit` auto-restart removed — frontend controls re-spawn via "Process Exited" UI.
- Stale reader threads are harmless post-decoupling — no cascade path. No cleanup mechanism needed.
- `PanelContext` gains `terminalId?: string` — terminal panels use it for PTY operations and ignore `path`.
