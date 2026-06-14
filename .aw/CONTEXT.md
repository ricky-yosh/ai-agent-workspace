# Context

## Domain Language

| Term | Definition | Avoid |
| --- | --- | --- |
| **PTY** | Pseudo-terminal — a kernel-level abstraction that pairs a shell process with a master fd for I/O. | |
| **Terminal Session** | A live PTY process identified by a stable UUID. Survives layout changes. | |
| **Terminal Panel** | A UI leaf node that renders xterm.js and references one Terminal Session by UUID. | |
| **PtyKey** | Backend lookup key: `String` (UUID). Replaces old `{ workspace_id, path }`. | |
| **PtyHandle** | Backend struct holding a PTY's child process, master fd, writer, reader thread. | |
| **PtyStore** | In-memory `HashMap<String, PtyHandle>` managed as Tauri state. | |
| **LayoutTree** | Recursive tree of SplitNode (children + direction + ratio) and LeafNode (panel_type). Persisted to sessions.json. Paths are implied by array position. | |
| **Path** | `Vec<usize>` / `number[]` — a positional index into the layout tree. Used for layout navigation only after refactor. | |
| **TerminalCache** | Module-level `Map<terminal_id, { terminal, fitAddon }>`. Pure DOM optimization, keyed by UUID. No longer stores `ptyId`. | |
| **Orphan PTY** | A PTY whose path no longer exists in the layout tree. Concept eliminated by UUID decoupling. | |

## Relationships

- A **Workspace** owns one **LayoutTree**.
- A **LayoutTree** contains zero or more LeafNode panels, some of type `"terminal"` with a `terminal_id`.
- A **Terminal Panel** mounts per LeafNode and connects to one **Terminal Session** by UUID.
- On app restart, persisted `terminal_id` values are preserved; fresh PTY processes are spawned against those IDs.

## Decisions

- **Full UUID decoupling refactor** — PTY identity decoupled from layout path. Terminal nodes gain a `terminal_id: string` field.
- **Big-bang refactor on a branch** — no incremental translation layer.
- **Persisted format gains `terminal_id`** on terminal leaf nodes. Migration on app boot: detect missing IDs, generate fresh UUIDs, save.
- **Session preservation required on join** — consuming panel's PTY is killed, survivor's PTY persists (path changes, UUID does not).
- **Frontend owns PTY restart** — backend emits `pty-exit` on shell exit, frontend decides whether to re-spawn. Backend does not auto-restart.
- **Detached reader threads are acceptable** — after `child.kill()` and dropping PtyHandle, stale reader threads are harmless. UUID decoupling removes the cascade path. No timeout or self-pipe needed.
- **Keep TerminalCache, re-key by `terminal_id`** — stores only `{ terminal, fitAddon }`, no `ptyId`. Pure DOM optimization.
- **Rename `update_workspace_tree` → `persist_workspace_tree`** — backend only persists the tree JSON. No cleanup logic.
- **Replace `pty-restart` with `pty-exit`** — frontend re-spawns via `pty_spawn` with same `terminal_id` when desired.
- **"Process Exited" UI state** — when `pty-exit` fires for a terminal, the `TerminalPanel` transitions to an interstitial ("Process exited — press Enter to restart") instead of auto-destroying the panel or auto-restarting.
- **Frontend provides `terminal_id`** — `pty_spawn({ terminal_id, sessionId, cwd })`. Frontend generates UUIDs for new panels and reads them from persisted tree for boot/restore.
- **PanelContext provides `terminal_id`** — `{ workspaceId, sessionId, path, terminalId? }`. terminal panels use `terminalId`, ignore `path` for PTY operations. Non-terminal panels have `terminalId: undefined`.
- **`pty_spawn` is idempotent by `terminal_id`** — calling spawn on an already-running PTY returns the existing handle. If the child process is dead, the stale handle is removed and a fresh PTY is spawned. Frontend explicitly calls `pty_kill` to replace.
- **Optimistic tree updates for splits** — generate UUID in frontend, update LayoutTree immediately (renders loading panel), let the mounting `TerminalPanel` invoke `pty_spawn` via its own `useEffect`. No awaiting IPC before tree mutation.
- **Fire-and-forget kills for joins** — update LayoutTree immediately to drop the consumed panel, then fire-and-forget `pty_kill(droppedTerminalId)`. No awaiting IPC before tree mutation.

