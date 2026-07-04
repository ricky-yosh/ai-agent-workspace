Status: ready-for-agent

# 01: C4 Diagram Schema & Repository

## What to build

The database foundation for C4 Diagrams: a new `c4_diagrams` table keyed by `repo_path` (not `session_id`), a `C4DiagramRepository` with CRUD operations, and the domain types. This establishes the first repo-scoped persistence pattern in the system.

The table stores diagrams as a single JSON blob containing Nodes, Edges, and Groups with C4 level metadata. Follows the existing repository pattern from `issue_repository.rs`.

## Acceptance criteria

- [ ] `c4_diagrams` table exists with columns: `id` (TEXT PK), `repo_path` (TEXT NOT NULL), `name` (TEXT NOT NULL), `diagram_json` (TEXT NOT NULL), `created_at` (TEXT NOT NULL), `updated_at` (TEXT NOT NULL)
- [ ] Index on `repo_path` for efficient lookup
- [ ] `SCHEMA_VERSION` bumped (or appropriate migration applied)
- [ ] `C4Diagram` domain struct with Serialize/Deserialize: `id`, `repo_path`, `name`, `diagram_json`, `created_at`, `updated_at`
- [ ] `C4DiagramRepository` provides: `create`, `list_by_repo_path`, `get`, `delete`, `rename`
- [ ] `C4DiagramsChanged { repo_path }` domain event variant exists
- [ ] Command variants: `C4DiagramCreate`, `C4DiagramList`, `C4DiagramGet`, `C4DiagramDelete`, `C4DiagramRename`
- [ ] Command results: `CommandResult::C4Diagram` and `CommandResult::C4Diagrams`
- [ ] Tauri read-only command handlers: `list_c4_diagrams`, `get_c4_diagram`
- [ ] Repository tests: create with name + json, list returns repo's diagrams, get by id, delete works, rename updates name + updated_at

## Blocked by

None — can start immediately.
