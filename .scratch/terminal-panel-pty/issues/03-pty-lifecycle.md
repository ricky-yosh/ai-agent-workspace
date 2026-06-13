# 03: PTY lifecycle — restart, persist, cleanup

Status: ready-for-agent

## Parent

PRD: `.scratch/terminal-panel-pty/PRD.md`

## What to build

Add the three remaining PTY lifecycle behaviors that make the terminal feel robust: auto-restart on process exit, persistence across tab switches, and automatic cleanup when panels are removed from the layout tree.

End-to-end behavior: when the user types `exit`, the terminal shows "Process exited. Restarting…" and immediately gets a fresh shell. When the user switches to another workspace tab, the PTY stays alive in the background and reconnects seamlessly on return. When a terminal panel is removed from the layout (panel type changed or joined away), its PTY is killed automatically.

### Backend: auto-restart on process exit

Modify the background read thread in `pty.rs`. When the PTY master read returns 0 (process exited):
1. Spawn a new PTY with the same command, cwd, and environment as the original
2. Generate a new UUID
3. Update the internal PTY store mapping (replace the old entry at `(workspace_id, path)`)
4. Emit `app.emit("pty-restart", { old_pty_id, new_pty_id, path })`
5. Start a new read thread for the new PTY

### Frontend: restart handling

In `TerminalPanel.tsx`:
- Subscribe to `listen("pty-restart")`. When `old_pty_id` matches the component's stored `ptyId`:
  1. Write `"\r\nProcess exited. Restarting…\r\n"` to xterm.js
  2. Update the stored `ptyId` to `new_pty_id`
  3. The existing `pty-output` listener continues working (filtered by the old `ptyId` — must update the filter to use the new `ptyId`)

- After switching ptyId, ensure the `pty-output` event filter uses the new ID. This may require unsubscribing the old listener and subscribing a new one with the updated filter.

### Backend: idempotent `pty_spawn` (persist across tab switches)

Modify `pty_spawn` in `pty.rs`:
- Before spawning, check if a PTY already exists at `(workspace_id, path)`
- If it exists and is alive (process still running), return its existing UUID — do not spawn a new one
- If it exists but the process has exited, kill it and spawn a new one

This makes `pty_spawn` safe to call on every mount (initial mount or re-mount after tab switch). The TerminalPanel already calls `pty_spawn` on every mount (from issue 02), so no frontend changes are needed.

### Backend: tree-diff cleanup

Modify the `update_workspace_tree` command handler in `lib.rs`:
1. Before applying the new tree, walk it to find all panel nodes with `panel_type: "terminal"` — collect their paths
2. After applying the new tree, walk it again to find all terminal panel paths
3. Compare: any `(workspace_id, path)` in the PTY store whose `workspace_id` matches the updated workspace, and whose `path` is absent from the new tree → kill that PTY and remove from the store

This handles both "panel removed via join" (path disappears) and "panel type changed from terminal to blank" (path still exists but is no longer a terminal node). The frontend calls `update_workspace_tree` as usual — no special PTY lifecycle handling needed.

## Acceptance criteria

- [ ] Typing `exit` in a visible terminal shows "Process exited. Restarting…" and a fresh shell prompt appears
- [ ] Auto-restart works in the background — switch to another tab, let a process exit, switch back, the terminal has a fresh shell
- [ ] `pty-restart` event fires with `{ old_pty_id, new_pty_id, path }`
- [ ] `pty_spawn` is idempotent: calling it twice with same `(workspace_id, path)` returns the same UUID
- [ ] Switching workspace tabs and back reconnects to the same PTY (same UUID, process still running)
- [ ] Removing a terminal panel from the layout (via join) kills its PTY
- [ ] Changing a panel from `"terminal"` to another type kills its PTY
- [ ] Tests exercise lifecycle transitions, not internal state

## Blocked by

- 01-pty-backend (needs `pty_spawn`, `pty_write`, `pty-output` event, read thread)
- 02-terminal-panel-frontend (needs TerminalPanel component to test end-to-end restart + tab switch)
