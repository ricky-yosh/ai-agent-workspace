Status: ready-for-agent

# 03: Workspace CRUD — Repository, Executor, Cascade Tests

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

Implement `WorkspaceRepository` in `crates/core/src/repositories/workspace_repository.rs`. The repository provides: `create`, `get`, `list_by_session`, `rename`, `delete`, `update_tree`.

Wire `WorkspaceList`, `WorkspaceGetActive`, `WorkspaceAdd`, `WorkspaceRemove`, `WorkspaceRename`, `WorkspaceSetActive`, `WorkspaceUpdateTree`, `WorkspaceReset` command arms in the executor to use `WorkspaceRepository`.

`WorkspaceAdd` should: verify the session exists, create the workspace, set it as the active workspace — all within a transaction. `WorkspaceReset` should: load the template by `template_id`, replace `current_tree` with the template's tree.

The `template_id` foreign key is nullable. If the template has been deleted, the workspace retains its `current_tree` and `template_id` becomes NULL (or the workspace is unaffected — the FK is optional metadata).

Write tests covering create, list by session, delete, update tree, cascade from session delete, and the `WorkspaceAdd` transactional behavior.

## Acceptance criteria

- [ ] `WorkspaceRepository` implements all listed methods
- [ ] Workspace CRUD commands work through the executor using repositories
- [ ] `WorkspaceAdd` verifies session existence, creates workspace, sets active — all in one transaction
- [ ] `WorkspaceReset` loads template tree and replaces workspace tree
- [ ] Nullable `template_id` works — workspace survives template deletion
- [ ] Session delete cascades to workspaces (reinforced from slice 2)
- [ ] All workspace commands return `CommandResult` as before
- [ ] Tests pass using in-memory SQLite

## Blocked by

- 01b-appstate-switch
