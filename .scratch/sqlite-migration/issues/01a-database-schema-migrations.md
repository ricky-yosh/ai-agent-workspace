Status: ready-for-agent

# 01A: Database + Schema + Migrations

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

Create the database infrastructure in `crates/core`. Introduce a `Database` struct that holds `db_path: PathBuf` and exposes a `connection()` method returning a fresh `rusqlite::Connection` with `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, and `busy_timeout=5000`.

Create a schema module with `CREATE TABLE` statements for `sessions`, `workspaces`, `layouts`, and `schema_version`. Create a migration module that runs schema creation idempotently and tracks the current version.

Add `rusqlite = { version = "0.40", features = ["bundled"] }` to `crates/core/Cargo.toml`.

Repository accessor methods (`db.sessions(&conn)`, `db.workspaces(&conn)`, `db.layouts(&conn)`) return concrete repository structs. The repository structs themselves are stubs at this point — full implementation comes in slices 2–4.

## Acceptance criteria

- [ ] `Database::connection()` returns a `rusqlite::Connection` with WAL, foreign_keys, and busy_timeout set
- [ ] `migrate(&conn)` creates `sessions`, `workspaces`, `layouts`, `schema_version` tables
- [ ] `migrate(&conn)` is idempotent — running it twice produces no errors
- [ ] Indices exist on `sessions(working_directory)`, `workspaces(session_id)`, `workspaces(template_id)`
- [ ] `db.sessions(&conn)`, `db.workspaces(&conn)`, `db.layouts(&conn)` return repository structs (stubs OK)
- [ ] Tests pass for all of the above using in-memory SQLite

## Blocked by

None — can start immediately.
