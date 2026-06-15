Status: ready-for-agent

# 08: Delete Old Persistence — Remove SessionRegistry, LayoutStore, File Watchers

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

Delete the old persistence infrastructure now that all commands go through repositories and events flow through domain events:

- Delete `crates/core/src/session_registry.rs`
- Delete `crates/core/src/layout_store.rs`
- Remove the `WatcherStore` trait and its implementations from `src-tauri/src/lib.rs`
- Remove file watcher setup (`notify::recommended_watcher`, `handle_watcher_event`, `reload_if_changed`) from `src-tauri/src/lib.rs`
- Remove `suppress_watcher` / `AtomicBool` fields (already gone with the deleted structs)
- Remove `save()` and `reload()` methods (already gone with the deleted structs)
- Remove `notify` dependency from `src-tauri/Cargo.toml`
- Remove re-exports of `SessionRegistry` and `LayoutStore` from `crates/core/src/lib.rs`
- Clean up any remaining imports of deleted types across all crates

Verify the entire workspace compiles (`cargo build --workspace`) and all tests pass (`cargo test --workspace`).

## Acceptance criteria

- [ ] `session_registry.rs` and `layout_store.rs` are deleted
- [ ] `WatcherStore` trait is deleted
- [ ] File watcher setup code is deleted
- [ ] `notify` dependency is removed from `src-tauri/Cargo.toml`
- [ ] No remaining imports of `SessionRegistry`, `LayoutStore`, or `WatcherStore` anywhere in the workspace
- [ ] `cargo build --workspace` succeeds
- [ ] `cargo test --workspace` passes

## Blocked by

- 05-execution-outcome-domain-events
