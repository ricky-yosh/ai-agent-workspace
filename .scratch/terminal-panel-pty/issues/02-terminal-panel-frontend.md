# 02: TerminalPanel frontend + registration

Status: ready-for-agent

## Parent

PRD: `.scratch/terminal-panel-pty/PRD.md`

## What to build

Add the TerminalPanel React component with xterm.js rendering, wire it to the PTY backend commands from issue 01, and register it as a panel type.

End-to-end behavior: a panel node with `panel_type: "terminal"` renders a real terminal emulator. On mount, the component opens xterm.js in a "connecting…" overlay state, calls `pty_spawn(workspace_id, path)`, and transitions to live when output arrives. Keystrokes are sent to the PTY via `pty_write`. Terminal resizes automatically when the panel container resizes.

### Dependencies

- `@xterm/xterm`
- `@xterm/addon-fit`
- `@xterm/addon-webgl`
- `@xterm/addon-web-links`
- `@xterm/addon-unicode11`

### TerminalPanel component (`src/TerminalPanel.tsx`)

- On mount (`useEffect`):
  1. Create `new Terminal()` with xterm.js defaults
  2. Load the four addons (`fit`, `webgl`, `web-links`, `unicode11`)
  3. Open xterm.js in a container div ref, show "connecting…" overlay
  4. Call `invoke("pty_spawn", { workspace_id, path })` → get `ptyId`, store in React state
  5. Subscribe to `listen("pty-output")`, filter by `ptyId`, call `terminal.write(data)`
  6. Remove overlay once first output arrives
- `terminal.onData(data)` → `invoke("pty_write", { ptyId, data })`
- `ResizeObserver` on the container element with 100ms debounce. Calculate `cols`/`rows` from element dimensions and font metrics. Call `invoke("pty_resize", { ptyId, cols, rows })`. Also call `fitAddon.fit()`.
- On unmount: `terminal.dispose()`, unsubscribe event listeners, disconnect `ResizeObserver`. Do NOT kill the PTY — the backend owns the PTY lifecycle.

### PanelContext (`src/SplitLayout.tsx`)

Create a `PanelContext` (React Context) with `{ workspaceId, path }`. `SplitLayout.renderNode` wraps each panel component in `<PanelContext.Provider value={{ workspaceId, path }}>`. `PanelProps` stays `{ panelType: string }` — no expansion needed. TerminalPanel reads from context. `SplitLayout` already receives `workspaceId` as a prop and tracks `path` internally.

### Panel registration

`registerPanel("terminal", "Terminal", TerminalPanel)` at the top of `TerminalPanel.tsx`. Import the file in `App.tsx` (same pattern as `BlankPanel`).

## Acceptance criteria

- [ ] Switching a panel to type `"terminal"` renders a working terminal emulator
- [ ] Typing in the terminal sends input to the PTY and shell output appears
- [ ] Terminal resizes when the panel container is resized (drag split handle)
- [ ] "connecting…" overlay is visible briefly while PTY spawns, then fades
- [ ] URLs in terminal output are clickable (web-links addon)
- [ ] Unicode characters display correctly (unicode11 addon)
- [ ] Scrollback works (scroll to see earlier output)
- [ ] Multiple terminal panels can be open simultaneously, each independent
- [ ] PanelContext provides `workspaceId` and `path` to panel components
- [ ] Tests exercise external behavior (rendered output, events, resize) — not internal state

## Blocked by

- 01-pty-backend (needs `pty_spawn`, `pty_write`, `pty_output` event)
