# PRD: Terminal Panel with PTY

Status: ready-for-agent

## Problem Statement

Users currently configure an "External Terminal" (iTerm2, Warp, etc.) that launches as a separate desktop app from the session sidebar. There is no way to run a CLI tool *inside* the app's panel layout — users must context-switch to an external window. Additionally, CLI-based AI tools (Claude Code, Codex) launched externally have no association with the current Session, making MCP tool attribution fragile.

## Solution

Add a "Terminal" panel type that runs a real PTY (pseudoterminal) inside a split panel. The PTY spawns the user's configured CLI tool (defaults to `$SHELL`) scoped to the current Session's working directory, with `AIAW_SESSION_ID` injected so any MCP tool launched from within inherits the session association. The terminal survives session and workspace tab switches, auto-restarts on process exit, and uses xterm.js for rendering with full addon support.

## User Stories

1. As a user, I want to switch a panel to "Terminal" so I can run CLI commands without leaving the app.
2. As a user, I want the terminal to start in my Session's working directory so that commands are immediately relevant to the project I'm on.
3. As a user, I want the terminal to spawn my preferred CLI tool (e.g. `claude`, `codex`, or my default shell) so that I can choose what I work with.
4. As a user, I want to configure my preferred CLI tool in Preferences so that every terminal panel I open uses it.
5. As a user, I want the terminal to offer presets (Default Shell, Claude Code, Codex CLI) plus a custom option so that common tools are one click away.
6. As a user, I want the terminal to look and feel like a real terminal emulator so that CLI tools with TUI interfaces (vim, htop, lazygit) render correctly.
7. As a user, I want the terminal to resize automatically when I resize the panel so that full-screen CLI tools adapt.
8. As a user, I want clickable URLs in terminal output so that I can open links without copy-pasting.
9. As a user, I want the terminal to scroll smoothly with my mouse so that I can review command history.
10. As a user, I want to scroll back through a reasonable amount of terminal history so that output from earlier commands isn't lost.
11. As a user, I want the terminal to auto-restart when I type `exit` so that it acts as a terminal reset rather than losing the panel.
12. As a user, I want the terminal to stay alive when I switch to another workspace tab or session so that my running processes aren't killed.
13. As a user, I want the terminal to show a brief transition state while the PTY is spawning so that I know something is happening.
14. As a user, I want to be able to have multiple terminal panels side by side so that I can run tools in parallel.
15. As a user, I want Unicode characters to display correctly so that modern CLI tools render properly.
16. As a user with the MCP server running, I want `AIAW_SESSION_ID` to be available inside the terminal so that MCP tools attribute commands to the correct Session automatically.

## Implementation Decisions

- PTY backend: `portable-pty` crate (from wezterm). Spawns a login shell (`$SHELL -l`) or the user's configured `pty_command`.
- Frontend rendering: `@xterm/xterm` with addons `@xterm/addon-fit`, `@xterm/addon-webgl`, `@xterm/addon-web-links`, `@xterm/addon-unicode11`. xterm.js opens immediately on mount with a "connecting…" overlay; the overlay fades once the PTY is alive and output starts flowing.
- IPC pattern: Tauri commands (`pty_spawn`, `pty_write`, `pty_resize`) and Tauri events (`pty-output`, `pty-restart`). Frontend subscribes to global events and filters by `ptyId`.
- Tauri command API:
  - `pty_spawn(workspace_id, path)` → `{ ptyId }` — idempotent: if a PTY already exists at (workspace, path), returns the existing UUID (adoption). Otherwise spawns a new one. Backend reads `pty_command` from Preferences, injects `AIAW_SESSION_ID`, sets cwd from the session's workingDirectory.
  - `pty_write(ptyId, data)` — writes input to the PTY. xterm.js `onData` → `invoke("pty_write")`.
  - `pty_resize(ptyId, cols, rows)` — resizes the PTY. Triggered by ResizeObserver with 100ms debounce.
  - No `pty_kill` command — backend handles cleanup via tree diff on `update_workspace_tree`.
- Tauri events:
  - `pty-output { ptyId, data }` — output from PTY. Rust reads PTY master in a background thread → `app.emit("pty-output")`. Frontend filters by ptyId → `terminal.write(data)`.
  - `pty-restart { oldPtyId, newPtyId, path }` — emitted when the backend auto-restarts a PTY on process exit. Visible panels show a "Process exited. Restarting…" message and switch to the new UUID. Hidden panels handle it silently (re-adopt on re-mount via idempotent `pty_spawn`).
- PTY mapping: backend-owned `HashMap<(WorkspaceId, PanelPath), PtyHandle>` managed as Tauri state. No `pty_id` field in the layout tree — the tree remains purely structural. The panel's tree path (e.g. `[0, 1, 0]`) is the stable identifier; maintained by SplitLayout, provided to panels via React Context (`PanelContext`).
- PTY lifecycle:
  - **Spawn**: when TerminalPanel mounts, `pty_spawn(workspace_id, path)` is called. Idempotent — safe to call on every mount (initial or re-mount after tab switch).
  - **Persist**: PTY process stays alive when the panel becomes invisible (tab/session switch). TerminalPanel unmounts on tab switch; PTY survives in the backend store. Re-mount → `pty_spawn` → idempotent adoption returns the same UUID.
  - **Restart**: process exit triggers backend-driven auto-restart. Backend spawns a new PTY with a new UUID and updates its internal mapping. Emits `pty-restart` for the frontend to switch its event stream. If the panel is hidden, no event is received — but the mapping is already updated, so re-mount adoption gets the new UUID.
  - **Cleanup**: when the frontend calls `update_workspace_tree`, the backend extracts all terminal panel paths from the new tree, diffs against its internal PTY mapping, and kills any PTY whose (workspace, path) is absent from the new tree. Handles both "panel removed via join" and "panel type changed to non-terminal." The PTY is bound to (workspace, path) — it only truly stops when its path disappears from the tree.
- Panel context: `SplitLayout` provides `workspaceId` and `path` via React Context (`PanelContext`) when rendering each panel. TerminalPanel reads from context — no `PanelProps` expansion needed. Other panel types ignore the context.
- Resize handling: `ResizeObserver` on the terminal container element. Calculates `cols`/`rows` from element dimensions and font metrics. Calls `pty_resize(ptyId, cols, rows)` with 100ms debounce.
- Environment: inherit full parent environment + inject `AIAW_SESSION_ID` + `cwd` set to Session's workingDirectory (resolved from `workspace_id` by the backend).
- Process exit: auto-restart immediate, backend-driven. When visible, xterm.js displays "Process exited. Restarting…" and switches to the new PTY's output stream. When hidden, restart is silent — the frontend reconnects via idempotent `pty_spawn` on re-mount.
- Scrollback: xterm.js default scrollback buffer (1000 lines). Configurable later.
- Code organization: PTY logic in `src-tauri/src/pty.rs` module. Tauri commands and state management in `src-tauri/src/lib.rs`. PTY store as `Mutex<HashMap<(Uuid, Vec<usize>), PtyHandle>>` via `app.manage()`. No new crate.
- Preferences: new `pty_command` key in preferences store. Presets: "Default Shell ($SHELL)", "Claude Code" (`claude`), "Codex CLI" (`codex`), "Custom..." (free-text). Follows existing `ToolRow` component pattern from the External Tools preferences section. Backend reads the preference in `pty_spawn` — frontend never passes a command.
- Panel registration: `registerPanel("terminal", "Terminal", TerminalPanel)`.
- The built-in "General" template seeds with a single `"terminal"` panel (replacing the former `"blank"` default). The redundant "Default" template is removed.
- Font: use xterm.js defaults initially. Later configurable.
- Dependencies: add `portable-pty` to `src-tauri/Cargo.toml`, add `@xterm/xterm` + 4 addons to `package.json`. No data model changes to the layout tree.

## Testing Decisions

- Test `pty_spawn(workspace_id, path)` returns a valid UUID and the process is running. Test idempotency: second call with same (workspace_id, path) returns the same UUID.
- Test `pty_write(ptyId, data)` sends data to the PTY and output appears via `pty-output` event.
- Test `pty_resize(ptyId, cols, rows)` updates the PTY dimensions (verify via `stty size` inside the PTY).
- Test backend-driven restart: send `exit\n` via `pty_write`, verify `pty-restart` event fires with old and new UUID, verify old PTY is dead and new PTY emits shell prompt via `pty-output`.
- Test backend tree-diff cleanup: call `update_workspace_tree` with a tree missing a terminal panel path, verify its PTY is killed.
- Test `AIAW_SESSION_ID` is set in the PTY environment (verify via `echo $AIAW_SESSION_ID`).
- Test PTY survives workspace switch: switch tab, call `pty_spawn` again with same (workspace, path), verify returns same ptyId and process is still running.
- Test xterm.js renders output correctly (verify terminal text matches expected output).
- Test addons: fit resizes the terminal on container resize, web-links makes URLs clickable.
- Test preferences: selecting a CLI tool preset causes next `pty_spawn` to spawn the correct command.
- Test multiple terminal panels: two panels at different paths get distinct ptyIds, independent processes.
- Good tests exercise Tauri command contracts and event payloads — not internal Rust struct fields.

## Out of Scope

- Terminal session restoration / reconnection across app restarts.
- Custom font configuration or theme support.
- Copy/paste integration with the system clipboard (default xterm.js behavior only).
- Terminal tabs or multiplexing within a single panel.
- Resuming a specific previous PTY command (see CONTEXT.md terminal restoration decision).
- Logging PTY output to Session artifacts.
- Panel Type Selector — that is a separate PRD and prerequisite.
- Keyboard shortcuts for terminal actions.
- Scrollback buffer configuration.

## Further Notes

- Depends on the Panel Interaction System PRD being completed first (users need the dropdown to switch panels to "Terminal" and drag-to-split to create multiple terminals).
- The existing `AIAW_SESSION_ID` injection logic in the MCP server already works — this PRD just adds the PTY that spawns with it.
- The `portable-pty` `CommandBuilder` supports `cwd()` natively, so setting the working directory is trivial.
- The existing `pty_command` domain term and `portable-pty` backend decisions are already recorded in `.aw/CONTEXT.md` and do not require a new ADR.
- The "General" built-in template changes from `"blank"` to `"terminal"` panel type. The "Default" template (seeded by Tauri `run()`) is removed entirely as redundant. See ADR 0012.
