Status: ready-for-agent

# 09: Verify End-to-End — All Commands Work, Events Flow, No Old Code Remains

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

Run a full verification pass across the entire workspace. This is not a code change — it is a validation that the migration is complete and correct.

Verification checklist:

1. **Build**: `cargo build --workspace` succeeds with no warnings related to dead code or unused imports from the migration
2. **Tests**: `cargo test --workspace` passes
3. **Lint**: `cargo clippy --workspace` produces no new warnings
4. **Schema**: SQLite database file is created at the expected path, contains all tables and indices
5. **Session commands**: Create, list, rename, delete, open, close all work through the Tauri app and MCP server
6. **Workspace commands**: Add, list, remove, rename, set active, update tree, reset, get active all work
7. **Template commands**: Save, list, delete, rename all work
8. **Events**: Frontend receives `"sessions-changed"` and `"layouts-changed"` events after mutations
9. **MCP**: MCP server receives change callbacks after mutations
10. **Concurrency**: Both Tauri app and standalone MCP server can operate on the same database without corruption
11. **No old code**: No references to `SessionRegistry`, `LayoutStore`, `WatcherStore`, `suppress_watcher`, `reload()`, `save()`, `notify::Watcher` remain in the codebase

If any check fails, file a follow-up issue and mark this slice complete with a note.

## Acceptance criteria

- [ ] `cargo build --workspace` succeeds
- [ ] `cargo test --workspace` passes
- [ ] `cargo clippy --workspace` has no migration-related warnings
- [ ] All session, workspace, and template commands work end-to-end
- [ ] Frontend receives correct events
- [ ] MCP server receives correct callbacks
- [ ] No old persistence code remains in the codebase
- [ ] Tauri app and MCP server can share the same database file

## Blocked by

- 06-tauri-event-bridge
- 07-mcp-event-bridge
- 08-delete-old-persistence
