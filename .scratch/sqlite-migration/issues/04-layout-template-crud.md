Status: ready-for-agent

# 04: Layout/Template CRUD — Repository, Executor, Tests

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

Implement `LayoutRepository` in `crates/core/src/repositories/layout_repository.rs`. The repository provides: `create`, `get`, `list`, `rename`, `delete`, `delete_all`.

Wire `TemplateList`, `TemplateSave`, `TemplateDelete`, `TemplateRename`, `TemplateDeleteAll` command arms in the executor to use `LayoutRepository`.

`LayoutTree` is stored as JSON text in the `tree` column using `serde_json`. The `layouts` table uses epoch milliseconds for `created_at` and `updated_at`.

Write tests covering create, get, list, rename, delete, and delete_all using in-memory SQLite.

## Acceptance criteria

- [ ] `LayoutRepository` implements all listed methods
- [ ] Template CRUD commands work through the executor using repositories
- [ ] `LayoutTree` round-trips correctly through JSON serialization in SQLite
- [ ] Timestamps are stored as integer epoch milliseconds
- [ ] All template commands return `CommandResult` as before
- [ ] Tests pass using in-memory SQLite

## Blocked by

- 01b-appstate-switch
