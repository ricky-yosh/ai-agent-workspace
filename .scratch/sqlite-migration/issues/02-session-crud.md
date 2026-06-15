Status: ready-for-agent

# 02: Session CRUD — Repository, Executor, Tests

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

Implement `SessionRepository` in `crates/core/src/repositories/session_repository.rs`. The repository provides: `create`, `get` (joins workspaces), `list` (returns summaries without workspaces), `rename`, `delete`, `delete_all`, `set_state`, `set_active_workspace`.

Wire `SessionCreate`, `SessionList`, `SessionRename`, `SessionDelete`, `SessionDeleteAll`, `SessionOpen`, `SessionClose` command arms in the executor to use `SessionRepository` instead of `SessionRegistry`.

`SessionRepository::get` reconstructs a full `Session` by joining the `workspaces` table. `SessionRepository::list` returns `Vec<SessionSummary>` without loading workspaces.

Write tests using in-memory SQLite covering create, get with workspace join, list, rename, delete, and cascade behavior (deleting a session removes its workspaces).

## Acceptance criteria

- [ ] `SessionRepository` implements all listed methods
- [ ] Session CRUD commands work through the executor using repositories
- [ ] `get` returns a `Session` with workspaces populated from the `workspaces` table
- [ ] `list` returns `SessionSummary` without workspaces
- [ ] Deleting a session cascades to workspaces (verified by test)
- [ ] All session commands return `CommandResult` as before (no behavioral change to callers)
- [ ] Tests pass using in-memory SQLite

## Blocked by

- 01b-appstate-switch
