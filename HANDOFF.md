# Architecture Review & Handoff: AI Agent Workspace

## Executive Summary

A Tauri v2 desktop app (Rust backend + React 19 frontend) that provides a collaborative workspace where humans and AI agents share visual layouts, terminal sessions, and workspace state. The architecture follows a **Command Pattern** (CQRS-lite) where all mutations flow through a single `execute()` function, exposed via both Tauri IPC and MCP (Model Context Protocol) stdio server.

**Maturity assessment:** The core architecture is sound and well-structured. The command layer separation is the strongest design decision. The codebase is at "v1 working product" stage with real gaps in testing, error handling at boundaries, and frontend robustness.

---

## Architecture Overview

### Dependency Graph

```
src-tauri (Tauri shell, PTY, file watcher)
  ├── crates/commands (Command enum, execute(), AppState)
  │     └── crates/core (SessionRegistry, LayoutStore)
  ├── crates/mcp (McpHandler, Tauri plugin)
  │     ├── crates/commands
  │     └── crates/core
  └── crates/core

crates/mcp-server (standalone binary)
  ├── crates/mcp (no Tauri feature)
  └── crates/core
```

### Data Flow

```
Frontend (React)  ──invoke()──►  #[tauri::command]  ─┐
                                                       ├──►  execute(Command, &AppState)
MCP Server (stdio) ──tool call──►  McpHandler         ─┘           │
                                                                    ▼
                                                        Mutex lock → core method → save()
                                                                    │
                                                                    ▼
                                                        CommandResult / CommandError
```

### Key Design Decisions (ADRs)

| ADR | Decision | Impact |
|-----|----------|--------|
| 0001 | Tauri + React over GPUI | Faster iteration, larger ecosystem, ~150MB bundle |
| 0004 | Template/Workspace Instance separation | Blender-like model; templates are global blueprints, workspaces are per-session instances |
| 0009 | Monolithic MCP server in dual mode | Same 18 tools embedded (Tauri plugin) or standalone (CLI binary) |
| 0011 | Session resolution fallback | Env var → CWD match → error |

---

## Strengths

### 1. Clean Command Layer Separation (`crates/commands/`)
- **Zero Tauri dependency.** The `commands` crate is pure Rust + serde. Business logic is fully testable and reusable by Tauri IPC, MCP, and any future interface.
- Single `execute()` function at `crates/commands/src/executor.rs:41` dispatches all 18+ command variants.
- `CommandError` at `crates/commands/src/error.rs:4` is a structured serializable type with category, entity, ID, and message fields.

### 2. Dual-Mode MCP Architecture (`crates/mcp/`, `crates/mcp-server/`)
- Feature-gated Tauri dependency (`tauri-integration` feature, default on). Standalone binary compiles without Tauri.
- `McpHandler` uses `Option<Arc<dyn Fn() + Send + Sync>>` callbacks for event emission, decoupled from `AppHandle`.
- 19 MCP tools covering full CRUD surface for sessions, templates, and workspaces.
- Session resolution cascade: env var → CWD-based matching (in `crates/mcp/src/session_resolution.rs:39`).

### 3. Shared State via Arc<Mutex<>>
- `AppState` at `crates/commands/src/state.rs:4` holds `Arc<Mutex<SessionRegistry>>` and `Arc<Mutex<LayoutStore>>`.
- Same `Arc`s are cloned into Tauri commands, file watcher, and MCP handler — all three subsystems share identical in-memory state.
- File watcher suppression (`AtomicBool`) prevents feedback loops when the app writes its own state files.

### 4. Panel Registry Pattern (`src/panelRegistry.tsx`)
- Module-level `Map<string, ComponentType<PanelProps>>` with self-registration via side-effect imports.
- Extensible: new panel types only need to import and call `registerPanel(type, label, component)`.

### 5. PTY UUID Decoupling
- Terminal identity is a UUID (`terminal_id`), decoupled from layout path.
- `pty_spawn` is idempotent by `terminal_id` — re-spawning an existing PTY returns the handle.
- Frontend owns PTY lifecycle; backend emits `pty-exit`, frontend decides whether to restart.

---

## Risk Areas & Gaps

### CRITICAL

#### 1. No Transactional Persistence
**Files:** `crates/core/src/session_registry.rs:343`, `crates/core/src/layout_store.rs:160`

`save()` writes the entire JSON file in one shot. A crash or power loss mid-write corrupts the only data file. No write-ahead log, no atomic rename, no backup.

**Recommendation:** Write to a temp file, then `rename()` (atomic on macOS/Linux). Keep one backup of the previous version.

#### 2. Zero Frontend Tests
**Scope:** All 40 files in `src/`

No test framework installed. No `.test.*`, `.spec.*`, or `__tests__/` directories. No jest, vitest, testing-library, playwright, or cypress in dependencies. The entire React application is untested.

#### 3. Error Information Lost at Tauri IPC Boundary
**File:** `src-tauri/src/lib.rs:43` (macro-generated commands)

`CommandError` is converted to a plain `String` via `.to_string()` for Tauri IPC. The MCP layer preserves structured errors (JSON-RPC codes + data), but the frontend receives only a string. This makes frontend error handling brittle.

### HIGH

#### 4. Implicit Lock Ordering
**File:** `crates/commands/src/executor.rs`

The convention is sessions-locked-before-layouts (e.g., lines 132-135, 171-173), but it's not enforced by the type system. A future developer reversing the order in one place introduces a deadlock. This is a silent failure mode.

**Recommendation:** Either document the invariant prominently or introduce a `lock_both()` helper that enforces ordering.

#### 5. Synchronous Filesystem I/O Under Mutex Lock
**File:** `crates/core/src/session_registry.rs:174-196`

`list()` calls `detect_project_type()` which checks for marker files (Cargo.toml, go.mod, etc.) on every call, under the mutex lock. With many sessions, this blocks all other operations.

#### 6. No React Error Boundaries
**Scope:** Entire frontend

A crash in any panel, context, or modal takes down the whole app. No error boundary wraps any section of the component tree.

#### 7. No Frontend State Rollback on Error
**File:** `src/App.tsx` (useWorkspaceManager, lines 64-203)

Workspace operations call `invoke()` and update state in `.then()`, but errors are only `console.error`'d. No optimistic UI with rollback, no user-facing error recovery.

### MEDIUM

#### 8. Macro Proliferation in Tauri Shell
**File:** `src-tauri/src/lib.rs:29-162`

10 macros (`command_handler!`, `session_return!`, `unit_return!`, etc.) generate 20+ Tauri commands. This reduces boilerplate but makes it hard to customize individual command behavior (add validation, logging, or middleware to one command).

#### 9. Thread-per-Terminal PTY Model
**File:** `src-tauri/pty.rs:122`

Each PTY spawns a dedicated OS thread for reading output. Acceptable for a desktop app with few terminals but does not scale. No async I/O.

#### 10. N Mutations = N File Writes
**File:** `crates/commands/src/executor.rs`

Every command that mutates state calls `save()` immediately. Rapid N mutations cause N file writes. No batching or debouncing at the command layer.

#### 11. CSS Duplication and Dead Styles
- Dialog styles duplicated between `SessionSidebar.css:392-603` and `Dialog.css:1-212`
- `LayoutToolbar.css` is orphaned (no component references it)
- Dark theme only; CSS variables in `App.css:1-15`

#### 12. Large Component Files
| File | Lines | Concern |
|------|-------|---------|
| `SessionSidebar.tsx` | 648 | Contains `NewSessionDialog` (135 lines), resize hook |
| `ManageTemplatesModal.tsx` | 640 | Contains `TemplateRow`, multiple hooks, dead props |
| `SplitLayout.tsx` | 520 | Recursive rendering, split/join logic |
| `App.tsx` | 439 | Contains `useWorkspaceManager`, `useKeyboardShortcuts`, `SaveAsTemplateDialog`, `MainArea` |

#### 13. Dual Event Systems in Frontend
- `SessionContext.tsx:53` uses raw `listen()` from `@tauri-apps/api/event`
- `App.tsx:93,280` uses the `useTauriEvent` wrapper hook
- Both do the same thing through different mechanisms

#### 14. Dead Code / Incomplete Features
- `ManageTemplatesModal` accepts `onDuplicateTemplate` and `workspaceCounts` props (lines 20-21) that are never passed
- `greet` command registered in `src-tauri/src/lib.rs:194` but never invoked from frontend
- `LayoutToolbar.css` is orphaned

### LOW

#### 15. PTY Tests Are Minimal
**File:** `src-tauri/pty.rs:267-311`

5 tests covering store creation, config clone, and no-op kill. No actual PTY spawn/read/resize tests.

#### 16. Inline Styles in PanelTypeSelector
**File:** `src/PanelTypeSelector.tsx:24-85`

Every other component uses CSS files. This one uses inline styles, breaking the pattern.

#### 17. xterm.js Internal API Access
**File:** `src/TerminalPanel.tsx:94`

Accesses `(terminal as any)._core?.optionsService?.rawOptions` to force `allowProposedApi`. This is a fragile hack against xterm's internal API.

---

## Test Coverage Matrix

| Layer | Tests | Coverage | Notes |
|-------|-------|----------|-------|
| `crates/core` (SessionRegistry) | 16 | Good | Unit tests with tempfile |
| `crates/core` (LayoutStore) | 13 | Good | Unit tests with tempfile |
| `crates/commands` (executor) | 6 | Adequate | Happy paths + some errors |
| `crates/mcp` (handler) | 16 | Good | Async tests via handler methods |
| `crates/mcp` (session_resolution) | 8 | Good | Unit tests |
| `crates/mcp-server` (integration) | 4 | Adequate | Process-level stdio tests |
| `src-tauri` (pty) | 5 | Minimal | Smoke tests only |
| `src-tauri` (lib.rs) | 0 | None | No tests for file watcher, macros, or Tauri commands |
| `src/` (frontend) | 0 | None | No test framework installed |

---

## Extensibility Assessment

### Adding a New Command
**Difficulty: Low**
1. Add variant to `Command` enum in `crates/commands/src/command.rs`
2. Add match arm in `execute()` at `crates/commands/src/executor.rs`
3. Add corresponding `CommandResult` variant if needed
4. Add MCP tool in `crates/mcp/src/lib.rs`
5. Add Tauri command via macro in `src-tauri/src/lib.rs`
6. Add frontend `invoke()` call

Well-defined extension points. The command pattern makes this straightforward.

### Adding a New Panel Type
**Difficulty: Low**
1. Create component file in `src/`
2. Call `registerPanel(type, label, component)` at module scope
3. Import the file in `App.tsx` for side-effect registration

The panel registry pattern is clean and extensible.

### Adding a New MCP Tool (non-command)
**Difficulty: Medium**
The current MCP tools are 1:1 with commands. Adding tools that don't map to commands (e.g., codebase intelligence) would require extending `McpHandler` with new dependencies and potentially new state. The `run_mcp_command!` macro helps with boilerplate.

### Adding a New Crate to the Workspace
**Difficulty: Low**
Add to `Cargo.toml` workspace members. Follow the pattern of `crates/commands/` (no Tauri dependency) or `crates/mcp/` (feature-gated Tauri).

### Adding Light Theme
**Difficulty: Medium**
CSS variables are defined in `App.css:1-15` with dark-only values. Would need a theme system (CSS class or media query) and variable overrides. No CSS modules to complicate things.

### Adding New Frontend State Management
**Difficulty: Medium**
Currently two React contexts + local state. Adding a global store (Zustand, Jotai) would be straightforward but requires migrating existing patterns. The `useWorkspaceManager` hook (200+ lines) is the primary candidate for extraction.

---

## Comparison to Standard Tauri + MCP Patterns

| Aspect | This Codebase | Best Practice | Status |
|--------|---------------|---------------|--------|
| Domain separation from Tauri | `crates/commands` has zero Tauri deps | Keep domain logic in pure Rust crates | ✅ Follows |
| MCP as separate crate | `crates/mcp` with feature-gated Tauri | MCP server in own crate, reusable standalone | ✅ Follows |
| `lib.rs` as real entry point | `src-tauri/src/main.rs` calls `lib::run()` | Mobile builds compile to library | ✅ Follows |
| State management | `Arc<Mutex<>>` shared across subsystems | Use `app.manage(Mutex::new(state))` | ⚠️ Uses Arc (Tauri handles sharing internally) |
| Error types | `CommandError` → `String` at IPC | Use proper error enums with `thiserror` | ⚠️ MCP preserves structure, Tauri loses it |
| Atomic file writes | Single-shot JSON write | Write-to-temp-then-rename | ❌ Missing |
| Frontend tests | None | At least component tests | ❌ Missing |
| rmcp macro usage | `tool_box!` macro for tool registration | `#[tool]` + `#[tool_router]` | ✅ Follows |

---

## File Quick Reference

### Rust Backend (key files)

| File | Purpose | Lines |
|------|---------|-------|
| `crates/core/src/session_registry.rs` | Session CRUD, persistence, project type detection | 614 |
| `crates/core/src/layout_store.rs` | Template CRUD, persistence | 365 |
| `crates/commands/src/command.rs` | Command enum (18 variants) | 68 |
| `crates/commands/src/executor.rs` | `execute()` dispatch + tests | 430 |
| `crates/commands/src/error.rs` | CommandError + from_core_error! macro | 90 |
| `crates/commands/src/state.rs` | AppState struct | 23 |
| `crates/mcp/src/lib.rs` | McpHandler, 19 MCP tools, Tauri plugin, tests | 575 |
| `crates/mcp/src/session_resolution.rs` | CWD-based session lookup + tests | 221 |
| `crates/mcp/src/error.rs` | CommandError → JSON-RPC error mapping | 19 |
| `crates/mcp-server/src/main.rs` | Standalone MCP binary | 63 |
| `src-tauri/src/lib.rs` | Tauri commands, file watcher, plugin registration | 554 |
| `src-tauri/src/pty.rs` | PTY spawn/read/resize/kill | 311 |

### Frontend (key files)

| File | Purpose | Lines |
|------|---------|-------|
| `src/App.tsx` | Root component, workspace manager, keyboard shortcuts | 439 |
| `src/SessionContext.tsx` | Session state, event listener | 77 |
| `src/SessionSidebar.tsx` | Session list, new session dialog, external tools | 648 |
| `src/SplitLayout.tsx` | Recursive layout rendering, split/join logic | 520 |
| `src/TerminalPanel.tsx` | xterm.js integration, PTY lifecycle | 348 |
| `src/panelRegistry.tsx` | Panel type plugin registry | 25 |
| `src/LayoutTabs.tsx` | Workspace tab bar | ~100 |
| `src/ManageTemplatesModal.tsx` | Template management dialog | 640 |
| `src/preferences-main.tsx` | Separate preferences window | 332 |

### Domain Docs

| File | Purpose |
|------|---------|
| `.aw/CONTEXT.md` | Domain glossary (PTY, LayoutTree, Path, etc.) |
| `.aw/adr/` | 10 ADRs covering UI stack, data model, MCP architecture |
| `PRD.md` | MCP Server v1 requirements (188 lines) |
| `IDEA.md` | Original vision document (831 lines) |

---

## Recommendations (Priority Order)

1. **Atomic file writes** — Write-to-temp-then-rename for `sessions.json` and `layouts.json`. Low effort, eliminates data corruption risk.

2. **Frontend test framework** — Install vitest + testing-library. Start with `SplitLayout` (most complex rendering logic) and `useWorkspaceManager` (heaviest state management).

3. **Structured errors at IPC boundary** — Change Tauri command macros to serialize `CommandError` as JSON instead of `.to_string()`. Add a typed error parser on the frontend.

4. **Lock ordering enforcement** — Create a `lock_both(sessions, layouts)` helper that always locks in the correct order. Use it everywhere both locks are needed.

5. **React error boundaries** — Wrap `SplitLayout` and `SessionSidebar` in error boundaries. At minimum, prevent a panel crash from taking down the whole app.

6. **Debounce file writes** — Batch rapid mutations in the executor or add a write-ahead buffer with a flush timer.

7. **Extract large components** — `NewSessionDialog` out of `SessionSidebar`. `TemplateRow` out of `ManageTemplatesModal`. `useWorkspaceManager` out of `App.tsx`.

8. **Unify event listener pattern** — Migrate `SessionContext.tsx` to use `useTauriEvent` wrapper instead of raw `listen()`.
