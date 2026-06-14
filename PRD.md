# PRD: Migrate Persistence from JSON to SQLite

## Problem Statement

The current persistence layer uses JSON files (`sessions.json`, `layouts.json`) as a database. This has created an entire subsystem of complexity — atomic temp-file writes, reload logic, file watchers, `suppress_watcher` flags, `WatcherStore` traits, reload loop prevention, and cross-process synchronization via `Arc<Mutex<>>` — that exists solely because persistence is file-based. The architecture does not scale: every workspace mutation rewrites the entire session, read operations serialize through a global mutex, and the file watcher is a fragile synchronization mechanism between processes.

## Solution

Replace JSON-file persistence with a single SQLite database. Normalize workspaces into their own table. Introduce concrete repository structs for typed query access. Return typed domain events from the command executor so Tauri and MCP can translate them independently. Delete the file watcher, `SessionRegistry`, `LayoutStore`, `WatcherStore`, and all associated reload/suppress infrastructure.

## User Stories

1. As a developer, I want sessions stored in SQLite, so that queries are indexed and I don't rewrite entire files for single-field updates
2. As a developer, I want workspaces in their own table with a `session_id` foreign key, so that workspace mutations don't require loading and rewriting the parent session
3. As a developer, I want a migration framework from day one, so that future schema changes are versioned and safe
4. As a developer, I want a `Database` struct that opens a fresh `rusqlite::Connection` per command, so that SQLite's WAL concurrency works without a shared mutex
5. As a developer, I want concrete repository structs (`SessionRepository`, `WorkspaceRepository`, `LayoutRepository`) accessed via `db.sessions()`, `db.workspaces()`, `db.layouts()`, so that SQL is centralized and command handlers stay clean
6. As a developer, I want the executor to return `ExecutionOutcome { result, events }`, so that the command layer produces typed domain events without knowing about Tauri or MCP
7. As a Tauri developer, I want the Tauri layer to translate `DomainEvent` variants into `"sessions-changed"` and `"layouts-changed"` events, so that the React frontend works unchanged
8. As an MCP developer, I want the MCP layer to translate `DomainEvent` variants into the existing callback pattern, so that tool behavior is preserved
9. As a developer, I want `AppState` to hold only `Database` (which holds `db_path: PathBuf`), so that there are no mutexes, no `Arc` wrapping, and no global locks
10. As a developer, I want `SessionRegistry`, `LayoutStore`, and `WatcherStore` deleted entirely, so that the old persistence subsystem is not partially retained
11. As a developer, I want file watcher infrastructure removed from `src-tauri/src/lib.rs`, so that `notify::Watcher`, `WatcherStore`, `reload_if_changed`, and `suppress_watcher` are gone
12. As a developer, I want `lock_both()` and canonical lock ordering removed from the executor, so that deadlock prevention code is no longer needed
13. As a developer, I want `AtomicBool` suppression flags removed from repositories, so that watcher-feedback-loop prevention is gone
14. As a developer, I want the MCP server to wrap persistence calls in `tokio::task::spawn_blocking`, so that the async MCP runtime can call synchronous rusqlite
15. As a developer, I want the `sessions` table to have an index on `working_directory`, so that session-by-directory lookups are O(1)
16. As a developer, I want the `workspaces` table to have an index on `session_id`, so that listing workspaces for a session is O(1)
17. As a developer, I want the `workspaces` table to have an index on `template_id`, so that template-based queries are efficient
18. As a developer, I want `LayoutTree` stored as JSON text in the `current_tree` column, so that the recursive tree structure is preserved without premature normalization
19. As a developer, I want timestamps stored as integer epoch milliseconds, so that they are sortable and unambiguous
20. As a developer, I want the `template_id` foreign key on workspaces to be nullable, so that a deleted template doesn't break existing workspaces
21. As a developer, I want `ON DELETE CASCADE` on `workspaces.session_id`, so that deleting a session automatically removes its workspaces
22. As a developer, I want `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` set on every connection, so that concurrent reads work and write contention is handled gracefully
23. As a developer, I want the crate structure preserved (`core`, `commands`, `mcp`, `mcp-server`, `src-tauri`), so that dependency direction stays clean
24. As a developer, I want `serde` and `serde_json` retained in `core` for `LayoutTree` serialization, so that the JSON-in-SQLite pattern works
25. As a developer, I want `tempfile` retained in dev-dependencies for in-memory SQLite testing, so that tests are isolated and fast

## Implementation Decisions

### Module Structure

All repositories and database infrastructure live in `crates/core`. The `commands` crate depends on `core` for repository access. The dependency direction is preserved: `core` has no knowledge of `commands`, `mcp`, or `tauri`.

```
crates/core/src/
├── database/
│   ├── mod.rs          -- Database struct, connection factory
│   ├── schema.rs       -- CREATE TABLE statements, indices
│   └── migrations.rs   -- Schema versioning, migrate() function
├── repositories/
│   ├── mod.rs
│   ├── session_repository.rs
│   ├── workspace_repository.rs
│   └── layout_repository.rs
├── domain/
│   ├── mod.rs
│   ├── session.rs      -- Session, SessionState, SessionSummary
│   ├── workspace.rs    -- Workspace (replaces WorkspaceInstance)
│   ├── layout.rs       -- Layout, LayoutTree, LayoutNode, Direction
│   └── events.rs       -- DomainEvent, ExecutionOutcome
├── lib.rs              -- Re-exports
```

### Database Module

```rust
pub struct Database {
    db_path: PathBuf,
}
```

`Database` exposes:
- `new(db_path) -> Database`
- `connection() -> Result<Connection>` — opens a fresh connection with WAL, foreign_keys, busy_timeout
- `sessions(&self, conn: &Connection) -> SessionRepository`
- `workspaces(&self, conn: &Connection) -> WorkspaceRepository`
- `layouts(&self, conn: &Connection) -> LayoutRepository`

Connection is opened per-command execution. No shared connection. No mutex.

### Schema

```sql
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    working_directory TEXT NOT NULL,
    state TEXT NOT NULL,
    active_workspace_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_id TEXT REFERENCES layouts(id),
    current_tree TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS layouts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tree TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_working_directory ON sessions(working_directory);
CREATE INDEX IF NOT EXISTS idx_workspaces_session_id ON workspaces(session_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_template_id ON workspaces(template_id);
```

### Repository Interfaces

`SessionRepository`:
- `create(name, working_dir) -> Result<Session>`
- `get(id) -> Result<Option<Session>>` — joins workspaces
- `list() -> Result<Vec<SessionSummary>>`
- `rename(id, new_name) -> Result<()>`
- `delete(id) -> Result<()>`
- `delete_all() -> Result<()>`
- `set_state(id, state) -> Result<()>`
- `set_active_workspace(id, workspace_id) -> Result<()>`

`WorkspaceRepository`:
- `create(session_id, name, template_id, tree) -> Result<Workspace>`
- `get(id) -> Result<Option<Workspace>>`
- `list_by_session(session_id) -> Result<Vec<Workspace>>`
- `rename(id, new_name) -> Result<()>`
- `delete(id) -> Result<()>`
- `update_tree(id, tree) -> Result<()>`

`LayoutRepository`:
- `create(name, tree) -> Result<Layout>`
- `get(id) -> Result<Option<Layout>>`
- `list() -> Result<Vec<Layout>>`
- `rename(id, new_name) -> Result<()>`
- `delete(id) -> Result<()>`
- `delete_all() -> Result<()>`

### Executor Refactor

The `execute` function signature changes from:

```rust
pub fn execute(command: Command, state: &AppState) -> Result<CommandResult, CommandError>
```

to:

```rust
pub fn execute(command: Command, state: &AppState) -> Result<ExecutionOutcome, CommandError>
```

Each command arm:
1. Opens a connection via `state.db.connection()`
2. Creates repositories via `state.db.sessions(&conn)` etc.
3. Performs mutations
4. Returns `ExecutionOutcome { result, events }`

Multi-step operations (e.g., `WorkspaceAdd` — verify session exists, insert workspace, update active_workspace_id) use `conn.transaction()`.

### DomainEvent Variants

```rust
pub enum DomainEvent {
    SessionsChanged,
    LayoutsChanged,
    WorkspaceChanged { session_id: String },
}
```

Coarse-grained for v1. Finer-grained variants (SessionCreated, WorkspaceAdded, etc.) can be added later without breaking the pattern.

### AppState Refactor

```rust
pub struct AppState {
    pub db: Database,
}
```

No `Arc<Mutex<>>`. No `SessionRegistry`. No `LayoutStore`. `AppState` is cheaply cloneable (contains only `PathBuf`).

### Tauri Event Bridge

In `src-tauri/src/lib.rs`:
- After `execute()`, iterate `outcome.events` and emit Tauri events
- `DomainEvent::SessionsChanged` → `app.emit("sessions-changed", ())`
- `DomainEvent::LayoutsChanged` → `app.emit("layouts-changed", ())`
- `DomainEvent::WorkspaceChanged { .. }` → `app.emit("sessions-changed", ())` (frontend compatibility)

### MCP Event Bridge

In `crates/mcp/src/lib.rs`:
- After `execute()` (via `spawn_blocking`), iterate `outcome.events` and invoke existing callbacks
- Same mapping as Tauri but through `on_session_changed` / `on_layouts_changed` callbacks

### Deletions

Remove entirely:
- `crates/core/src/session_registry.rs`
- `crates/core/src/layout_store.rs`
- `WatcherStore` trait and implementations in `src-tauri/src/lib.rs`
- File watcher setup (`notify::recommended_watcher`, `handle_watcher_event`, `reload_if_changed`)
- `suppress_watcher` / `AtomicBool` fields
- `lock_both()` and canonical lock ordering in executor
- `save()` / `reload()` methods on old stores
- `notify` dependency from `src-tauri/Cargo.toml`

### Dependencies

Add to `crates/core/Cargo.toml`:
- `rusqlite = { version = "0.40", features = ["bundled"] }`

Remove from `src-tauri/Cargo.toml`:
- `notify = "6"`

Retain in `crates/core/Cargo.toml`:
- `serde`, `serde_json` (for LayoutTree serialization)
- `uuid` (for ID generation)
- `chrono` (for epoch milliseconds)
- `thiserror`

Retain in dev-dependencies:
- `tempfile`

## Testing Decisions

Good tests verify external behavior through the public interface, not implementation details. Use in-memory SQLite (`Connection::open_in_memory()`) for isolation and speed.

### Database Tests (Required)

- `migration_creates_all_tables` — verify `sessions`, `workspaces`, `layouts`, `schema_version` exist after `migrate()`
- `migration_is_idempotent` — run `migrate()` twice, verify no errors
- `connection_sets_pragmas` — verify WAL mode, foreign keys, busy_timeout are active

### Repository Tests (Required)

`SessionRepository`:
- `create_session`
- `get_session_joins_workspaces`
- `list_sessions`
- `delete_session`
- `rename_session`
- `delete_session_cascades_workspaces` — critical FK behavior test

`WorkspaceRepository`:
- `create_workspace`
- `list_by_session`
- `delete_workspace`
- `update_tree`

`LayoutRepository`:
- `create_layout`
- `list_layouts`
- `delete_layout`

### Executor Tests (Required)

These verify application behavior, not persistence internals:
- `workspace_add_creates_default_active_workspace`
- `workspace_reset_restores_template_tree`
- `session_delete_removes_all_workspaces`
- `workspace_set_active_updates_session`
- `template_delete_does_not_break_workspaces`

### Event Tests (Required)

- `session_create_returns_sessions_changed_event`
- `workspace_add_returns_workspace_changed_event`
- `layout_save_returns_layouts_changed_event`
- `read_only_commands_return_empty_events` (SessionList, WorkspaceList, etc.)

### Bridge Tests (Minimal)

- `domain_event_maps_to_tauri_event_name`
- `domain_event_maps_to_mcp_callback`

## Out of Scope

- Migration of existing JSON data — users start fresh
- Async persistence (sqlx) — rusqlite is synchronous per ADR 0001
- Trait-based repository abstractions — concrete structs only
- Finer-grained domain events (SessionCreated, WorkspaceAdded, etc.) — coarse-grained for v1
- Frontend changes — React code works unchanged via same event names
- PostgreSQL support
- Panel metadata indexing or search
- Workspace snapshots or versioning
- Connection pooling

## Further Notes

The `commands` crate's public interface (`Command`, `CommandResult`, `CommandError`) remains largely unchanged. Callers (Tauri commands, MCP tools) adapt to `ExecutionOutcome` wrapping but the command enum itself is stable.

The `mcp-server` standalone binary constructs its own `AppState` with `Database` directly, same pattern as today but without `Arc<Mutex<>>`.

WAL mode enables concurrent readers with a single writer. For this desktop application's workload (user-driven actions, occasional MCP writes), SQLite will not be a bottleneck. The per-command connection model avoids replacing one mutex problem with another.
