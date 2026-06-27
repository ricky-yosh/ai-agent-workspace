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
| **Issue** | A tracked unit of work or report belonging to a Session, stored in the database; the AI creates them and the user views them. Ephemeral app state, never committed to the repo. | Task, Ticket |
| **Issue Tracker** | The panel type that displays a session's Issues in a GitHub-style list. | |

## Relationships

- A **Session** contains zero or more **Workspaces**.
- A **Session** contains zero or more **Issues**.
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
- Issues are ephemeral app state stored in SQLite, never committed to the repo or working directory; see [ADR 0013](adr/0013-issue-tracker-storage.md).
- Issues attach to a Session via `session_id` FK with `ON DELETE CASCADE`, mirroring workspaces.
- An Issue has a per-Session sequential `number` (GitHub-style `#N`), a `title`, a markdown `body`, an `author` (`ai`/`user`), and `created_at`/`updated_at`.
- Issue lifecycle and triage are two independent axes: `state` (`open`/`closed`) and a `labels` JSON array (default `["needs-triage"]`).
- Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`; the AI may add ad-hoc labels.
- No comment thread in v1; the AI keeps the Issue `body` current as a living description. Comments (a separate `issue_comments` table) are a possible fast-follow.
- The Issue Tracker panel is read-only for the user; all Issue mutations flow through the AI via MCP. The panel reads via Tauri (`list_issues`, `get_issue`) and refreshes on the `issues-changed` event.
