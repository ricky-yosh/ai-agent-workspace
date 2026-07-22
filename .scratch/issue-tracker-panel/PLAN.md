# Plan: Local Issue Tracker Panel

Status: ready-for-agent

A local, GitHub-style issue tracker surfaced as a new **Issue Tracker** panel type. The AI creates and maintains issues; the user views them. Issues are ephemeral application state stored in SQLite — never committed to the repo.

See [`.aw/CONTEXT.md`](../../.aw/CONTEXT.md) for vocabulary and [ADR 0013](../../.aw/adr/0013-issue-tracker-storage.md) for the storage decision.

## Resolved decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Storage | SQLite (app-support DB), ephemeral, never in repo | Structured/live/queryable; fits existing rusqlite architecture. Distinct from the dev-time `.scratch/*.md` convention. ([ADR 0013](../../.aw/adr/0013-issue-tracker-storage.md)) |
| Ownership | Per **Session** (`session_id` FK, `ON DELETE CASCADE`) | A Session ≈ a repo; issues are stable facts about the project, not a transient layout. Mirrors `workspaces`. |
| Lifecycle vs triage | Two axes: `state` (`open`/`closed`) **+** `labels` (JSON array) | GitHub's model; the axes are independent. Reuses the existing triage vocabulary. |
| Comments | **Out of v1** | The AI keeps `body` current. `issue_comments` table is an additive fast-follow. |
| User writes | **Read-only panel**; all writes via the AI (MCP) | Faithful to "AI writes / user sees"; single write path, clean `author` attribution. |

## Data model

```sql
CREATE TABLE IF NOT EXISTS issues (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    number      INTEGER NOT NULL,                    -- per-session sequential (#N)
    title       TEXT    NOT NULL,
    body        TEXT    NOT NULL DEFAULT '',         -- markdown
    state       TEXT    NOT NULL DEFAULT 'open',     -- 'open' | 'closed'
    labels      TEXT    NOT NULL DEFAULT '["needs-triage"]',  -- JSON array of strings
    author      TEXT    NOT NULL,                    -- 'ai' | 'user'
    created_at  INTEGER NOT NULL,                    -- epoch millis
    updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_session_number ON issues(session_id, number);
CREATE INDEX        IF NOT EXISTS idx_issues_session_id     ON issues(session_id);
```

`number` is computed on create via `SELECT COALESCE(MAX(number), 0) + 1 FROM issues WHERE session_id = ?`. When the highest-numbered issue in a session is deleted, the next create reuses that number — accepted for an ephemeral tracker; the UNIQUE index prevents collisions.

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. The AI may add ad-hoc labels (e.g. `bug`).

## Surfaces

**MCP (AI — full write set), `author` hardcoded `"ai"`:**
`issue_create`, `issue_list`, `issue_get`, `issue_update` (title/body/labels/state — covers close, reopen, relabel), `issue_close`, `issue_delete`.

**Tauri (panel — read only):** `list_issues`, `get_issue`.

**Live update path:** MCP write → `DomainEvent::IssuesChanged { session_id }` → `on_issues_changed` callback → `"issues-changed"` Tauri event (payload `{ session_id }`) → panel re-fetches filtered by `session_id`. The bridge is the MCP callback, **not** `emit_domain_events` — in v1 no Tauri command mutates issues, so `emit_domain_events`'s new `IssuesChanged` arm is a compile requirement only. Adding `IssuesChanged` breaks two exhaustive `DomainEvent` matches (`invoke_callbacks` in MCP, `emit_domain_events` in Tauri). `invoke_callbacks` gains a 4th callback param carrying `session_id`; existing macro callback arms pass `&None` for it, a new arm passes the real callback. A feature-gated helper emits the event with payload. See step 13.

**Panel (`registerPanel("issue-tracker", "Issue Tracker", …)`):** session-scoped list of issues (`#N`, title, `state` badge, labels), open issues first; click to expand the markdown `body`. Read-only. Fetches via `list_issues` on mount, re-fetches on `"issues-changed"`.

## Implementation touchpoints (ordered)

1. `crates/core/src/domain/issue.rs` — **new** `Issue` struct (Serialize/Deserialize).
2. `crates/core/src/domain/mod.rs` — `pub mod issue;` + re-export.
3. `crates/core/src/domain/events.rs` — add `IssuesChanged { session_id: String }`.
4. `crates/core/src/lib.rs` — re-export `Issue`.
5. `crates/core/src/database/schema.rs` — bump `SCHEMA_VERSION` (3 → 4); add `issues` table + indices to `CREATE_TABLES`; update `test_schema_version_is_three` → four; add migration test asserting the `issues` table exists (mirror `test_migrate_creates_tables`).
6. `crates/core/src/repositories/issue_repository.rs` — **new** `IssueRepository` (`create`, `list_by_session`, `get`, `update`, `close`, `delete`), mirroring `session_repository.rs`. `list_by_session` orders open-first then by number. Domain timestamps are ISO strings; reuse the existing `epoch_millis_to_iso` helper from `session_repository.rs`.
7. `crates/core/src/repositories/mod.rs` — module + re-export.
8. `crates/core/src/database/mod.rs` — `db.issues(&conn)` factory.
9. `crates/commands/src/command.rs` — `IssueCreate | IssueList | IssueGet | IssueUpdate | IssueClose | IssueDelete`.
10. `crates/commands/src/result.rs` — `CommandResult::Issue(Issue)` + `Issues(Vec<Issue>)`.
11. `crates/commands/src/executor.rs` — match arms; emit `IssuesChanged` on mutations.
12. `src-tauri/src/lib.rs` — add `IssuesChanged` arm to `emit_domain_events` (compile requirement; in v1 no Tauri command mutates issues, so this arm is dead code — the live bridge is the MCP callback in step 13). **Read-only** Tauri handlers `list_issues`/`get_issue` via `command_handler!`; register in `generate_handler!`.
13. `crates/mcp/src/lib.rs` — cross-cutting event wiring + issue tools:
    - Add `IssuesChanged { session_id }` arm to `invoke_callbacks` and a 4th callback param `issues_cb: &Option<Arc<dyn Fn(String) + Send + Sync>>`; existing macro callback arms pass `&None` for it (no changes to existing tool call sites).
    - Add `on_issues_changed` field to `McpHandler` (`Option<Arc<dyn Fn(String) + Send + Sync>>`).
    - Add a feature-gated `make_session_id_callback` helper that emits `"issues-changed"` with `{ session_id }` payload (prior art: `make_workspace_change_callback`).
    - Wire `on_issues_changed` in `init()` (`None` for standalone MCP, i.e. when `tauri-integration` is off).
    - Add a new `run_mcp_command!` macro arm that passes `issues_cb` (avoids touching existing tool call sites).
    - Add `issue_*` `#[tool]` methods + `tool_box!` entries: mutating tools (`issue_create`, `issue_update`, `issue_close`, `issue_delete`) use the new `issues_cb` arm; read tools (`issue_list`, `issue_get`) use the no-callback `json` arm. `author` is hardcoded `"ai"` for `issue_create`.
14. `src/IssueTrackerPanel.tsx` — **new** TS `Issue` interface (matching the serialized Rust struct, snake_case per convention); panel component with `list_issues` on mount + `useTauriEvent("issues-changed", …)` filtered by `session_id`; `registerPanel("issue-tracker", "Issue Tracker", …)`.
15. `src/App.tsx` — side-effect import `import "./IssueTrackerPanel";`.

## Out of scope (v1)

- Comment thread (`issue_comments` table) — fast-follow.
- User-initiated writes from the panel.
- Assignees, milestones, linked issues, full-text search.

## Next step

Run `/to-prd` or `/to-issues` against this plan, or hand it to an implementation agent.
