# ADR 0013: Store Issues in SQLite, Not the Repo

## Status

Accepted

## Context

We are adding an in-app issue tracker surfaced as a new panel type. The AI creates and updates issues; the user reads (and may act on) them inside a workspace.

The project already has a developer-facing convention (`AGENTS.md`): planning issues and PRDs live as markdown files under `.scratch/<feature-slug>/`. A reader could reasonably expect the new tracker to reuse that file-based convention, which would give git-diffable, human-editable issue files.

We rejected that. The in-app tracker holds ephemeral, run-time application state — the AI's working notes about a session — not source artifacts that belong in version control. It needs stable IDs, an open/closed lifecycle, per-session numbering, and live updates as the AI writes. Markdown files in the working directory serve those poorly: parsing overhead, file-watching, git noise, and the risk of accidental commits.

The app's persistence is already `rusqlite` (ADR 0001) with concrete Repositories, a `Command` enum, and MCP tools. Issues fit that grain exactly.

## Decision

Store issues in the application's SQLite database (the app-support DB that already holds sessions, workspaces, and layouts), **not** as files in the repository or the session's working directory. Issues are ephemeral application state and are never committed to version control.

Implement them with the existing patterns: an `issues` table, an `IssueRepository`, `Issue*` `Command` variants, an `IssuesChanged` `DomainEvent`, and `issue_*` MCP tools. The `.scratch/<feature-slug>/` markdown convention remains a separate, developer-facing planning mechanism and is unaffected.

## Consequences

- Issues are structured, queryable, and live-updating; the panel refreshes via the existing `DomainEvent` → Tauri event pipeline.
- Issues never appear in `git status` and cannot be accidentally committed; they travel with the app's database, not the codebase.
- Issues are not human-editable outside the app and not git-diffable. Portability is whatever the app-support DB provides.
- Two issue-like concepts now coexist: in-app **Issues** (SQLite, runtime) and `.scratch/` planning issues (markdown, dev-time). The names must be kept distinct to avoid confusion.
- Adds a schema-version bump plus a new table, repository, commands, and MCP tools.
