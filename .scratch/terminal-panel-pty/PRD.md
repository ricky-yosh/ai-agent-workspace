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
- Frontend rendering: `@xterm/xterm` with addons `@xterm/addon-fit`, `@xterm/addon-webgl`, `@xterm/addon-web-links`, `@xterm/addon-unicode11`.
- IPC pattern: Tauri commands for writes (`pty_write(ptyId, data)`), Tauri events for reads (`pty-output` event with `{ ptyId, data }`). xterm.js `onData` → `invoke("pty_write")`. Rust reads PTY master in a background thread → `app.emit("pty-output")`.
- PTY identification: each PTY gets a generated UUID. The frontend stores it in React state on the `TerminalPanel` component. All subsequent commands reference this ID.
- PTY lifecycle: spawns when a panel is switched to `"terminal"`, persists through tab/session switches (process lives in background), auto-restarts on process exit (`exit` = reset), kills only when the panel node is removed from the layout tree OR switched to another type.
- Resize handling: `ResizeObserver` on the terminal container element. Calculates `cols`/`rows` from element dimensions and font metrics. Calls `pty_resize(ptyId, cols, rows)` with 100ms debounce.
- Process exit: auto-restart immediately. No overlay, no confirmation — just respawn the same command.
- Environment: inherit full parent environment + inject `AIAW_SESSION_ID` + `pwd` set to Session's workingDirectory.
- Scrollback: xterm.js default scrollback buffer (1000 lines). Configurable later.
- Code organization: PTY logic in `src-tauri/src/pty.rs` module. Tauri commands exposed in `src-tauri/src/lib.rs`. No new crate.
- Preferences: new `pty_command` key in preferences store. Presets: "Default Shell ($SHELL)", "Claude Code" (`claude`), "Codex CLI" (`codex`), "Custom..." (free-text). Follows existing `ToolRow` component pattern from the External Tools preferences section.
- Panel registration: `registerPanel("terminal", "Terminal", TerminalPanel)`.
- The built-in "General" template seeds with a single `"terminal"` panel (replacing the former `"blank"` default). The redundant "Default" template is removed.
- Font: use xterm.js defaults initially. Later configurable.
- Dependencies: add `portable-pty` to `src-tauri/Cargo.toml`, add `@xterm/xterm` + 4 addons to `package.json`.

## Testing Decisions

- Test `pty_spawn` Tauri command returns a valid UUID and the process is running.
- Test `pty_write` sends data to the PTY and output appears via `pty-output` event.
- Test `pty_resize` updates the PTY dimensions (verify via `stty size` inside the PTY).
- Test process auto-restart: send `exit\n` via `pty_write`, verify `pty-output` emits new shell prompt.
- Test `AIAW_SESSION_ID` is set in the PTY environment (verify via `echo $AIAW_SESSION_ID`).
- Test PTY survives workspace switch (frontend reconnection to same ptyId).
- Test xterm.js renders output correctly (verify terminal text matches expected output).
- Test addons: fit resizes the terminal on container resize, web-links makes URLs clickable.
- Test preferences: selecting a CLI tool preset spawns the correct command.
- Test multiple terminal panels: two panels get distinct ptyIds, independent processes.
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
