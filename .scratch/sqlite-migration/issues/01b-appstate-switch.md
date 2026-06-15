Status: ready-for-agent

# 01B: AppState Switch to Database

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

Replace the current `AppState` (which holds `Arc<Mutex<SessionRegistry>>` and `Arc<Mutex<LayoutStore>>`) with a new `AppState` that holds only `Database`. The new `AppState` is cheaply cloneable — it contains only a `PathBuf`.

Update `crates/commands/src/state.rs` to define the new `AppState`. Update `crates/commands/src/executor.rs` to open a connection via `state.db.connection()` and create repositories at the start of each command arm. At this stage the executor still returns `Result<CommandResult, CommandError>` — the `ExecutionOutcome` wrapper comes in slice 5.

The executor should use `conn.transaction()` for multi-step operations (e.g., commands that verify existence then mutate). Remove `lock_both()` and canonical lock ordering since there are no more mutexes.

Wire the new `AppState` into `src-tauri/src/lib.rs` and `crates/mcp-server/src/main.rs`. The old `SessionRegistry` and `LayoutStore` are still used by un-migrated commands at this point — that's OK. Commands that have been wired to repositories use the new path; others fall through to old code temporarily.

## Acceptance criteria

- [ ] `AppState` contains `pub db: Database` and no `Arc<Mutex<>>` fields
- [ ] Executor opens a fresh connection per command execution
- [ ] Multi-step commands use `conn.transaction()`
- [ ] `lock_both()` and canonical lock ordering are removed
- [ ] Tauri app and MCP server compile and start with the new `AppState`
- [ ] Existing tests pass (or are updated to use new `AppState`)

## Blocked by

- 01a-database-schema-migrations
