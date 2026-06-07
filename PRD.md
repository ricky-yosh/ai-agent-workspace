# PRD: CLI System with Command Layer

## Problem Statement

The AI Agent Workspace backend (SessionRegistry, LayoutStore, Workspace management) can only be exercised through the Tauri GUI. There is no way to test the core engine from the command line. This makes it impossible to verify backend behavior without spinning up the desktop app, slows down development iteration, and blocks future integration work (MCP servers, scripting) that will depend on a shared Command Layer. The project needs a CLI that is the foundation for the canonical command interface described in the architecture — not a throwaway test harness.

## Solution

Restructure the Rust backend into a Cargo workspace with three crates — `core` (domain logic), `commands` (Command enum + executor), and `cli` (standalone binary) — so that all interfaces dispatch through the same Command Layer. The CLI (`aiaws`) exposes Session, Template, and Workspace operations as subcommands with JSON output. The existing Tauri app is rewired to depend on `commands` instead of calling core modules directly.

## User Stories

1. As a developer, I want to run `aiaws session list` from the terminal, so that I can see all Sessions without opening the GUI.
2. As a developer, I want to create a Session from the CLI by providing a workingDirectory and name, so that I can test session creation without the GUI.
3. As a developer, I want to rename a Session from the CLI, so that I can verify rename logic works end-to-end.
4. As a developer, I want to delete a Session from the CLI, so that I can clean up test data.
5. As a developer, I want to open a Session from the CLI, so that I can verify the open workflow (state transition, workspace auto-creation) works.
6. As a developer, I want to close a Session from the CLI, so that I can verify the close workflow (state transition) works.
7. As a developer, I want to list all Layout Templates from the CLI, so that I can see what templates exist.
8. As a developer, I want to save a new Layout Template from the CLI with inline JSON, so that I can quickly create templates for testing.
9. As a developer, I want to save a new Layout Template from the CLI with a file path, so that I can create complex nested templates without shell escaping.
10. As a developer, I want to delete a Layout Template from the CLI, so that I can clean up test templates.
11. As a developer, I want to rename a Layout Template from the CLI, so that I can verify rename logic.
12. As a developer, I want to list all Workspace Instances for a Session from the CLI, so that I can inspect a Session's tab bar.
13. As a developer, I want to get the active Workspace Instance for a Session from the CLI, so that I can see which tab is selected.
14. As a developer, I want to add a Workspace Instance to a Session from the CLI by referencing a template ID, so that I can test the template-to-instance flow.
15. As a developer, I want to remove a Workspace Instance from a Session from the CLI, so that I can test workspace cleanup.
16. As a developer, I want to rename a Workspace Instance from the CLI, so that I can verify rename logic.
17. As a developer, I want to set the active Workspace Instance for a Session from the CLI, so that I can test tab switching.
18. As a developer, I want to update a Workspace Instance's layout tree from the CLI with inline JSON or a file, so that I can test layout modifications.
19. As a developer, I want to reset a Workspace Instance back to its template from the CLI, so that I can test the reset workflow.
20. As a developer, I want all CLI commands to return JSON output, so that I can parse results programmatically and write automated tests.
21. As a developer, I want the CLI to show `--help` for all subcommands, so that I can discover available operations without reading source code.
22. As a developer, I want the CLI to return non-zero exit codes on errors, so that I can detect failures in scripts.
23. As a developer, I want the CLI to print structured JSON errors on failure, so that I can parse error details programmatically.
24. As a developer, I want `open_session` to auto-create a default Workspace Instance if the Session has none, so that every opened Session is ready to use.
25. As a developer, I want `open_session` to auto-create a default Layout Template if none exist, so that the first run always works.
26. As a developer, I want the Command enum to be the single source of truth for all operations, so that adding a new interface (MCP, UI) means only adding a parser, not re-implementing dispatch logic.
27. As a developer, I want the `execute()` function to accept a generic state container, so that the same executor works for CLI (direct) and future Tauri IPC (in-process).
28. As a developer, I want the Tauri app to be rewired to dispatch through the Command Layer, so that CLI and GUI share the same execution path.
29. As a developer, I want the existing unit tests for SessionRegistry and LayoutStore to pass after the workspace restructure, so that no regressions are introduced.
30. As a developer, I want the CLI binary to have no Tauri dependencies, so that it compiles fast and stays small.

## Implementation Decisions

### Cargo workspace structure

Restructure into a Cargo workspace with three crates (see ADR 0007):

- `crates/core/` — lib crate containing domain logic: `SessionRegistry`, `LayoutStore`, and all shared types (`Session`, `SessionSummary`, `SessionState`, `WorkspaceInstance`, `Layout`, `LayoutTree`, `LayoutNode`, `Direction`). No dependency on Tauri, CLI frameworks, or command abstractions. All existing unit tests move here and continue to pass. Core types are the API contract — their serde attributes are the canonical JSON shape consumed by all interfaces. No DTO layer in v1.

- `crates/commands/` — lib crate containing the `Command` enum, `CommandResult` enum, and an `execute()` function that dispatches commands to core modules. Depends on `core`. Contains an `AppState` struct that wraps `SessionRegistry` and `LayoutStore`.

- `crates/cli/` — binary crate containing the `aiaws` CLI binary. Uses `clap` for argument parsing. Depends on `commands`. No Tauri dependencies.

- `src-tauri/` — modified Tauri app. Depends on `commands` instead of directly importing core modules. Tauri commands become thin wrappers that call `execute()`.

### Command enum

The `Command` enum lives in `crates/commands/` and has 18 variants:

**Session commands:**
- `CreateSession { working_dir: String, name: String }`
- `ListSessions`
- `RenameSession { session_id: String, new_name: String }`
- `DeleteSession { session_id: String }`
- `OpenSession { session_id: String }`
- `CloseSession { session_id: String }`

**Template commands:**
- `ListTemplates`
- `SaveTemplate { name: String, tree: LayoutTree }`
- `DeleteTemplate { layout_id: String }`
- `RenameTemplate { layout_id: String, new_name: String }`

**Workspace commands:**
- `ListWorkspaces { session_id: String }`
- `GetActiveWorkspace { session_id: String }`
- `AddWorkspace { session_id: String, template_id: String }`
- `RemoveWorkspace { session_id: String, workspace_id: String }`
- `RenameWorkspace { session_id: String, workspace_id: String, new_name: String }`
- `SetActiveWorkspace { session_id: String, workspace_id: String }`
- `UpdateWorkspaceTree { session_id: String, workspace_id: String, tree: LayoutTree }`
- `ResetWorkspace { session_id: String, workspace_id: String }`

### CommandResult enum

The `CommandResult` enum has variants matching the return types of each command:

- `Session(Session)`
- `Sessions(Vec<SessionSummary>)`
- `Layout(Layout)`
- `Layouts(Vec<Layout>)`
- `Workspace(WorkspaceInstance)`
- `Workspaces(Vec<WorkspaceInstance>)`
- `Unit(())`

### Executor

The `execute()` function signature:

```rust
fn execute(cmd: Command, state: &mut AppState) -> Result<CommandResult, CommandError>
```

It pattern-matches on `Command` and calls the appropriate method on `SessionRegistry` or `LayoutStore`. Error handling maps core errors to a `CommandError` type.

### AppState

The `AppState` struct wraps `SessionRegistry` and `LayoutStore`. For the CLI, it's constructed in `main()` by calling `SessionRegistry::new()` and `LayoutStore::new()`. For the Tauri app, it replaces the existing `AppState` in `lib.rs`.

### CLI structure

The CLI binary uses `clap` with derive macros. Subcommand structure:

```
aiaws session <subcommand> [args]
aiaws template <subcommand> [args]
aiaws workspace <subcommand> [args]
```

All output is JSON. Errors return non-zero exit codes with JSON error bodies.

### Tree arguments

Both `template save` and `workspace update-tree` accept:
- `--tree <json>` — inline JSON string
- `--tree-file <path>` — path to a JSON file

If neither is provided for `template save`, the default single-panel layout is used.

### Tauri app rewiring

The existing `src-tauri/src/lib.rs` Tauri commands become thin wrappers. Each `#[tauri::command]` function constructs a `Command` variant, calls `execute()`, unpacks the `CommandResult` variant, and returns the inner bare type. The existing `AppState` struct is replaced with one from the `commands` crate.

### Output contract

All interfaces (CLI, Tauri IPC, future MCP) share the same JSON shapes defined by the serde attributes of core types (see ADR 0008). On success, data is written to stdout. On failure, a structured error JSON is written to stderr and the process returns a non-zero exit code. No outer envelope — exit codes signal success/failure.
- **CLI**: Prints `CommandResult` inner value to stdout, `CommandError` JSON to stderr.
- **Tauri IPC**: Unwraps `CommandResult` and returns the bare type to the frontend.

## Testing Decisions

### What makes a good test

Tests verify external behavior (inputs → outputs / side effects), not internal implementation details. For Rust modules, tests call the public API with known inputs and assert the returned data and filesystem state. Tests use temporary directories to avoid coupling to the real App Support Dir.

### Modules tested

- **`crates/core/` — SessionRegistry**: All existing tests move here. Test create, list, rename, delete, open (state transitions), close, startup demotion (running→paused), reachability checking, and workspace CRUD (add, remove, rename, set active, update tree, reset, get active, get workspaces).

- **`crates/core/` — LayoutStore**: All existing tests move here. Test save, list, delete, get, rename, default layout production, persistence round-trip, and missing file handling.

- **`crates/commands/` — Command executor**: New tests. Test that each `Command` variant dispatches to the correct core method and returns the expected `CommandResult`. Use temporary directories for isolation. Test error cases (session not found, workspace not found, layout not found).

### Prior art

The existing `session_registry.rs` and `layout_store.rs` both have comprehensive test suites using `tempfile::TempDir` for isolation. The command executor tests should follow the same pattern.

## Out of Scope

- Task operations — removed from scope per user decision.
- Whiteboard canvas — no Cards, Edges, or Frames.
- Command Layer middleware, undo/redo stack, or event generation.
- event-log.jsonl and Log Panel.
- Terminal Panel, Diff Viewer Panel.
- Workspace MCP, Codebase MCP, Codebase Viz MCP.
- Panel types beyond "blank".
- Any AI integration.
- Multi-window management.
- Macros, scripting, multiplayer.
- Pretty-printing CLI output (JSON only for v1).
- Interactive/prompted CLI mode.
- Shell completions.
- CLI commands for Cards, Edges, Frames, Artifacts, or Events.

## Further Notes

- The `open_session` command has side effects: it auto-creates a default Layout Template if none exist, and auto-creates a Workspace Instance if the Session has none. This matches the existing behavior in `lib.rs:open_session`.
- The CLI uses `template` as the subcommand name (not `layout`) to distinguish global Layout Templates from per-session Workspace Instances. The domain terms remain unchanged in CONTEXT.md.
- The workspace restructure must not break the existing Tauri app. The `src-tauri/` crate should compile and run after rewiring to depend on `commands`.
- The `commands` crate should have its own error type (`CommandError`) that wraps core errors with additional context (which command failed, why).
- The CLI binary should have no dependency on `tauri`, `tauri-plugin-dialog`, or any frontend crate. It depends only on `commands`, `clap`, and `serde_json`.
