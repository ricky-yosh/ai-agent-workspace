# PRD: Session Sidebar Context Menu & Preferences

## Problem Statement

The Session Sidebar currently offers only two inline actions per session row: Rename and Delete. When a user wants to open a session's workingDirectory in Finder, launch their code editor in that directory, open a diff tool to review changes, or start a terminal there, they must manually navigate via Finder or terminal — breaking their flow. There is no way to copy a Session ID or workingDirectory path to the clipboard. Additionally, the app has no configuration system — users cannot set preferences for which external tools to launch.

## Solution

Add a right-click context menu to each session row in the Session Sidebar with six actions: Open in Finder, Open in Editor, Open in External Diff, Open in Terminal, Copy SessionID, and Copy Session Path. The Editor, Diff Tool, and Terminal actions launch user-configured external applications. Configuration is done in a separate Preferences window (opened via Cmd+, or app menu) with a single "External Tools" section containing preset dropdowns and an optional custom path input. When a tool is unconfigured and the user clicks its action, a toast notification appears with a "Configure" button that opens Preferences directly. The existing inline Rename and Delete buttons remain unchanged alongside the new context menu.

## User Stories

1. As a user, I want to right-click a session row and see a context menu with quick actions, so that I can access common operations without leaving the sidebar.
2. As a user, I want to click "Open in Finder" on a session, so that the session's workingDirectory opens in macOS Finder.
3. As a user, I want to click "Open in Editor" on a session, so that my preferred code editor (Cursor, VS Code, etc.) opens in that directory.
4. As a user, I want to click "Open in External Diff" on a session, so that my preferred diff tool (Fork, GitKraken, etc.) opens for that repository.
5. As a user, I want to click "Open in Terminal" on a session, so that my preferred terminal app (iTerm2, Warp, etc.) opens in that directory.
6. As a user, I want to copy a session's UUID to the clipboard via "Copy SessionID", so that I can reference it in scripts or share it.
7. As a user, I want to copy a session's workingDirectory path via "Copy Session Path", so that I can paste it into a terminal command.
8. As a user, I want to open the Preferences window via Cmd+, or the app menu, so that I can configure my external tool preferences without reaching for a config file.
9. As a user, I want to select my preferred editor from a list of common presets (Cursor, VS Code, Windsurf, etc.), so that I don't need to know the application's bundle name.
10. As a user, I want to select my preferred diff tool from a list of common presets (Fork, GitKraken, Sourcetree, etc.), so that I can use the tool I already have installed.
11. As a user, I want to select my preferred terminal from a list of common presets (iTerm2, Warp, Terminal, etc.), so that my existing terminal workflow is preserved.
12. As a user, I want to type a custom application name or bundle identifier when my tool is not in the preset list, so that I can use any editor, diff tool, or terminal I want.
13. As a user, I want my preferences to persist across app restarts, so that I don't need to reconfigure every time I launch.
14. As a user, I want to see a toast notification when I click an external tool action but haven't configured that tool yet, so that I know I need to set a preference.
15. As a user, I want the toast notification to include a "Configure" button, so that I can go directly to the Preferences window instead of hunting for it.
16. As a user, I want the context menu to appear at the mouse cursor position when I right-click a session row, so that it feels responsive and native.
17. As a user, I want to dismiss the context menu by clicking anywhere outside it or pressing Escape, so that I can cancel accidental right-clicks.
18. As a user, I want the Preferences window to be a separate OS window, so that it feels native and I can keep it open while using the main window.
19. As a user with "missing" (unreachable) sessions, I want all six context menu actions to work — Finder opens the parent directory if the target doesn't exist, the other tools attempt to launch and show a toast if the path is unreachable.
20. As a user, I want to see a toast notification when an external tool fails to launch (app not installed, path unreachable), so that I know what went wrong and can fix my configuration.
21. As a user, I want clipboard copy failures to show a toast notification, so that I know the copy didn't work and can try again.
22. As a user who presses Cmd+, when the Preferences window is already open, I want it to come to the front, so that I'm not confused by an apparently non-working shortcut.

## Implementation Decisions

### Context Menu

The context menu is added to existing session rows in the Session Sidebar. It follows the same pattern already used for workspace tab context menus and split layout context menus: an `onContextMenu` handler sets a state with `{x, y, sessionId}`, and a conditionally rendered overlay + positioned menu div uses the existing `ContextMenu.css` styles. The position accounts for the sidebar's scroll offset so the menu appears at the correct screen position regardless of scroll state. Clicking the overlay, selecting an action, or pressing Escape dismisses the menu.

The context menu is identical for all session states (running, paused, missing) — all six actions are always shown. The existing inline Rename and Delete buttons remain on the session row and are not moved into the context menu.

Each of the six menu items triggers one of three behaviors:
- **Open in Finder** — calls the opener plugin to reveal the session's workingDirectory in Finder. If the path does not exist on disk, falls back to revealing the parent directory.
- **Open in Editor / Open in External Diff / Open in Terminal** — reads the corresponding preference from the store, then launches the configured application via the opener plugin. If no preference is set, shows a toast with a "Configure" button. If the launch fails (app not installed, path unreachable), shows an error toast.
- **Copy SessionID / Copy Session Path** — writes to the system clipboard. If the clipboard API rejects or fails, shows an error toast.

### Toast Notification System

A new custom React component renders fixed-position, auto-dismissing toast messages in the bottom-right of the app window. Toasts are managed through a React context, following the same pattern as the existing SessionContext. Each toast accepts an optional `action` (label + callback), enabling the "Configure" button on unconfigured-tool toasts. Toasts auto-dismiss after 4 seconds. Up to 3 toasts are visible at once, stacked vertically; if more arrive, the oldest is dismissed. Toast types include: info (for unconfigured tools), error (for launch failures, clipboard failures, store failures), and the user can dismiss any toast manually by clicking a close button.

### Preferences Window

The Preferences window is a separate OS window (label `preferences`) created via Tauri's `WebviewWindowBuilder`. The window size is 520x400, not resizable, with a title of "Preferences". It is opened programmatically by the Rust backend in response to a menu item click (Cmd+,) or by the frontend when the toast "Configure" button is clicked. If the window is already open, it is brought to the front rather than creating a duplicate.

The Preferences window uses its own Vite entry point (`preferences.html`) with a separate React mount, since the project does not use a client-side router. This requires a Vite multi-page configuration. The window has the same Tauri capabilities as the main window (core:default, opener:default, store permissions).

The Preferences UI is a single flat form in v1 — a header "External Tools" and three tool selection rows. The layout is structured to accept additional sections in the future (a sidebar or tabs can be added without changing the form components). Each tool type (Editor, Diff Tool, Terminal) is rendered as a row with a label and a preset dropdown. The preset dropdown lists common macOS applications. Selecting "Custom..." reveals an inline text input for entering an arbitrary application name or bundle identifier. Changes are auto-saved to the store on every selection change or text input change (debounced at 300ms to avoid excessive writes).

### Preferences Store

Preferences are persisted via `tauri-plugin-store` as a key/value JSON file. The store is auto-saved on every change in the Preferences window. The store file lives in the platform's app config directory (separate from the App Support Dir used for session state).

Store schema:
- `external_editor` (string) — the application name or bundle ID for the editor. Empty string = unconfigured.
- `external_diff_tool` (string) — the application name or bundle ID for the diff tool. Empty string = unconfigured.
- `external_terminal` (string) — the application name or bundle ID for the terminal. Empty string = unconfigured.

When reading, a missing or empty key is treated as unconfigured. If the store fails to load (corrupted file, disk error), all preferences default to empty and the user sees an error toast. If the store fails to write, the user sees an error toast.

### Tool Launching

A single async function `launchTool(toolType, workingDirectory)` reads the stored preference, constructs the appropriate opener call, and executes it. The function returns a result that the caller uses to determine whether to show a success toast or an error toast.

Tool-specific behavior:
- **Finder**: Uses the opener plugin's `revealItemInDir` function. If workingDirectory is unreachable, attempts to reveal the first existing parent directory.
- **Editor**: Launches via `open -a "<AppName>" <workingDirectory>` using the opener plugin.
- **Diff Tool**: Launches via `open -a "<AppName>" <workingDirectory>`. The workingDirectory is expected to be a git repository. If the workingDirectory is not a git repository, the app shows a toast: "The directory is not a git repository. The diff tool may not show any changes."
- **Terminal**: Launches via `open -a "<AppName>" <workingDirectory>` using the opener plugin.

If the launch fails (app not installed, OS rejects the launch, opener plugin error), the user sees an error toast: "Failed to launch [AppName]. Is it installed?".

### Preset Lists and Bundle Names

**Editors:**
| Preset label | Bundle name |
|---|---|
| Cursor | `Cursor` |
| VS Code | `Visual Studio Code` |
| Windsurf | `Windsurf` |
| VS Code Insiders | `Visual Studio Code - Insiders` |
| Zed | `Zed` |
| Custom... | (user-provided) |

**Diff tools:**
| Preset label | Bundle name |
|---|---|
| Fork | `Fork` |
| GitKraken | `GitKraken` |
| Sourcetree | `Sourcetree` |
| GitX | `GitX` |
| Custom... | (user-provided) |

**Terminals:**
| Preset label | Bundle name |
|---|---|
| iTerm2 | `iTerm` |
| Warp | `Warp` |
| Terminal | `Terminal` |
| Hyper | `Hyper` |
| Custom... | (user-provided) |

### Tauri Menu Integration

A native macOS menu is added to the Tauri app. It includes the standard app menu (AI Agent Workspace) with About, Preferences... (Cmd+,), and Quit. The Preferences menu item emits an event that triggers opening the Preferences window from the Rust backend.

### Permissions and Dependencies

New dependencies:
- **Rust**: `tauri-plugin-store = "2"` added to `src-tauri/Cargo.toml`
- **JS**: `@tauri-apps/plugin-store: "^2"` added to `package.json`

The `tauri-plugin-opener` and `@tauri-apps/plugin-opener` are already installed and permitted.

New permissions in `src-tauri/capabilities/default.json`:
- `store:default` added to the `permissions` array
- The `windows` array updated from `["main"]` to `["main", "preferences"]`

The `preferences` window inherits the same capabilities as `main` by sharing the same capability entry.

Clipboard access uses the standard Web API `navigator.clipboard.writeText()`, which requires no additional Tauri permissions. On macOS, the first clipboard write may trigger a native permission prompt; if denied, an error toast is shown.

### Error Handling Summary

| Scenario | Behavior |
|---|---|
| Tool preference unconfigured | Toast: "No [tool type] configured" with "Configure" button |
| External tool launch fails (app not installed) | Toast: "Failed to launch [AppName]. Is it installed?" |
| workingDirectory unreachable (Finder) | Reveal parent directory |
| workingDirectory unreachable (Editor/Diff/Terminal) | Attempt launch; if OS rejects, show error toast |
| workingDirectory is not a git repo (Diff) | Toast: "Not a git repository. Diff tool may not show changes." |
| Clipboard write fails | Toast: "Failed to copy to clipboard" |
| Store read fails (corrupted, disk error) | Default to unconfigured; toast: "Failed to load preferences" |
| Store write fails | Toast: "Failed to save preferences" |
| Preferences window creation fails | Console error; Cmd+, becomes a silent no-op (OS-level logging only) |

## Testing Decisions

### What makes a good test

Tests verify external behavior — they check that the context menu renders the correct items, that action clicks trigger the expected side effects (clipboard write, opener plugin call, or toast), and that preferences are correctly read from and written to the store. Tests use mocked dependencies (opener plugin, clipboard API, store plugin) to avoid side effects and focus on the component's response to each outcome. Tests do not couple to implementation details like internal state structure or exact DOM nesting.

### Modules tested

- **Context menu** — Render a session row, simulate a right-click event, verify the menu appears at the correct position, verify all six items are present, verify clicking an item triggers the expected action and dismisses the menu, verify clicking outside or pressing Escape dismisses, verify the menu is identical regardless of session state.
- **Toast component** — Trigger a toast via the toast context, verify it appears, verify it auto-dismisses after 4 seconds, verify the "Configure" action button works when provided, verify multiple toasts stack vertically (max 3), verify error toasts render with distinct styling.
- **Preferences window** — Mount the Preferences component with a mock store, verify the form is populated from stored values, change a selection and verify the store is updated (debounced), verify the "Custom..." option reveals the text input, verify an empty store renders all fields as unconfigured.
- **Tool launcher** — Call the launcher with a configured preference, verify the opener plugin is invoked with the correct application name and path. Call with an unconfigured preference, verify a toast is triggered. Call with an unreachable path, verify the correct fallback behavior. Call with a non-git-repo path for diff tool, verify the appropriate toast.

### Prior art

The existing context menu in `SplitLayout.tsx` and `LayoutTabs.tsx` demonstrates the `{x, y, ...}` state pattern and overlay-based menu rendering. The toast system follows the same React component pattern as the existing context menu overlay. The store integration follows standard Tauri plugin patterns (similar to how `tauri-plugin-opener` is registered and used). Tests mirror the existing component test patterns in the codebase (e.g., session registry tests verify state transitions through public interfaces).

## Out of Scope

- Additional Preferences sections beyond "External Tools" (e.g., Appearance, General, Terminal behavior). The UI is structured to accept them but they are not implemented.
- In-app launching of external tools (the tools are always launched as separate OS applications, not embedded in the app's panels).
- Remote or cloud-based editors (GitHub Codespaces, Gitpod).
- Tool auto-detection — all presets are always shown regardless of whether the application is installed.
- Windows and Linux support — preset lists use macOS bundle names. The `open` / `revealItemInDir` calls use macOS-specific APIs.
- Keyboard shortcuts for individual context menu items (beyond the Cmd+, shortcut for Preferences).
- Drag-and-drop reordering of sessions in the sidebar.
- Multi-selection of sessions (batch actions).
- Custom tool categories or user-defined preset lists.
- Preferences import/export or sync.
- Toast persistence or history.
- Moving the existing Rename/Delete inline buttons into the context menu (they remain as-is).

## Further Notes

- Context menu actions do not require the session to be open (running state). They operate solely on the session's workingDirectory path and the stored preferences.
- "Open in External Diff" launches the diff tool in the workingDirectory. The tool itself handles staging detection and file selection; the app does not pre-select specific files.
- The tool launcher is a shallow module — a single async function with no side effects beyond opening an app or showing a toast. It can be tested in isolation with mocked dependencies.
- The Vite multi-page configuration adds a second entry point (`preferences.html`) pointing to a separate React mount (`src/preferences-main.tsx`). The existing `index.html` / `src/main.tsx` entry is unchanged.
- The Preferences window URL used by `WebviewWindowBuilder` is the dev server URL with `/preferences.html` appended (in dev) or the bundled file path (in production). The Tauri config or Rust code handles the environment-dependent URL resolution.
- The toast context wraps the entire app (similar to how SessionContext wraps the app), making the toast API available to any component without prop drilling.
