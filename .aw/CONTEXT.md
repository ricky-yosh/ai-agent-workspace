# Context

## Domain Language

| Term | Definition | Avoid |
| --- | --- | --- |
| **Session** | A configured working directory with associated workspaces and state. | Working Directory |
| **Workspace** | A visual layout instance belonging to a session, created from a template. | WorkspaceInstance |
| **Template** | A reusable layout definition. Workspaces reference a template but are not updated when the template changes. | Layout |
| **LayoutTree** | A recursive tree of splits and panels describing a workspace's visual arrangement. | Layout |
| **Command** | A discrete, serializable operation that mutates application state. | Action, Operation |
| **ExecutionOutcome** | Return type of a command: `{ result, events }` where `events` are `DomainEvent` variants. | |
| **DomainEvent** | A typed enum describing what changed during a command execution. The command layer produces them; Tauri and MCP translate them independently. | Event |
| **Repository** | A concrete struct (e.g. `SessionRepository`) holding a `&Connection` reference, providing typed query methods. No traits. | |
| **Database** | Holds `db_path: PathBuf`. Opens a fresh `rusqlite::Connection` per command. Exposes repository accessors (`db.sessions(&conn)`, etc.). | DB, Connection |
| **AppState** | Holds `Database` only. No mutexes. Cloned cheaply (PathBuf). | State |

## Relationships

- A **Session** contains zero or more **Workspaces**.
- A **Workspace** references one **Template**.
- A **Template** is standalone; modifying it does not affect existing workspaces.
- A **Workspace** owns one **LayoutTree**.
- A **Database** owns one or more **Repositories**.
- An **AppState** owns one **Database**.
- A **Command** returns an **ExecutionOutcome** containing **DomainEvents**.

## Decisions

- Persistence: rusqlite (sync), see [ADR 0001](adr/0001-use-rusqlite-sync.md).
- Concrete repositories, no trait indirection.
- Workspaces normalized with `session_id` FK. Templates are optional metadata on workspaces.
- No migration from JSON. Start fresh.
