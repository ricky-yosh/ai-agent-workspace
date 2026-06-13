# 04: pty\_command preferences

Status: ready-for-agent

## Parent

PRD: `.scratch/terminal-panel-pty/PRD.md`

## What to build

Add a `pty_command` preference that lets users choose which CLI tool spawns inside Terminal Panels. The default is `$SHELL`. Users can pick from presets or enter a custom command.

End-to-end behavior: the user opens Preferences (Cmd+,), sees a new "Terminal" row in the External Tools section with a preset dropdown. Selecting a preset causes the next Terminal Panel to spawn that tool. The backend reads the preference automatically in `pty_spawn` — no frontend changes to TerminalPanel needed.

### Preference key

Add `pty_command` to the preferences store (`tauri-plugin-store`). Default value: `$SHELL` (use the environment variable). The key stores the raw command string.

### Preferences UI (`src/preferences-main.tsx`)

Add a new row in the External Tools section following the existing `ToolRow` component pattern. The row has:
- Label: "Terminal"
- Preset dropdown:
  - **"Default Shell ($SHELL)"** — value: `$SHELL`
  - **"Claude Code"** — value: `claude`
  - **"Codex CLI"** — value: `codex`
  - **"Custom…"** — selecting this reveals a free-text input field for any command string (binary name or path)

Follow the same structure as `External Editor` and `External Diff Tool` rows in the Preferences window.

### Backend (`pty.rs`)

`pty_spawn` reads `pty_command` from `tauri-plugin-store` at spawn time:
- If `"$SHELL"` → use `std::env::var("SHELL").unwrap_or("/bin/sh")` with `-l` flag
- Otherwise → use the stored command string directly (split on spaces for binary + args)

The `pty_spawn` command signature does not change — no command parameter needed. The frontend never passes a command.

## Acceptance criteria

- [ ] Default terminal spawns `$SHELL` with `-l` flag
- [ ] Selecting "Claude Code" in Preferences → next terminal spawns `claude`
- [ ] Selecting "Codex CLI" in Preferences → next terminal spawns `codex`
- [ ] Selecting "Custom…" reveals a free-text input; entering a command string → next terminal spawns that command
- [ ] Changing the preference takes effect on the next terminal spawn without app restart
- [ ] Preferences window follows existing `ToolRow` component pattern
- [ ] Tests verify the backend reads the preference correctly (not the UI layout)

## Blocked by

- 01-pty-backend (needs `pty_spawn` command to read the preference)
