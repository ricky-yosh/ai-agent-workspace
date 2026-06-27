Status: ready-for-agent

# 01: Create and view

## What to build

The thinnest end-to-end path for the Issue Tracker: the AI creates an issue via MCP, it's stored in SQLite, and the user sees it in a live-refreshing Issue Tracker panel. This establishes the full plumbing — schema, domain types, repository, commands, Tauri handlers, MCP tools with the cross-cutting event wiring, and the React panel — so every subsequent slice only adds behavior on top.

## Acceptance criteria

- [ ] `issues` table exists in the database with all columns (id, session_id, number, title, body, state, labels, author, created_at, updated_at), indices (unique session_id+number, session_id), and SCHEMA_VERSION bumped to 4
- [ ] Migration test asserts the issues table exists; schema version assertion updated from 3 to 4
- [ ] `Issue` domain struct derives Serialize/Deserialize; `IssuesChanged { session_id }` domain event variant exists
- [ ] `IssueRepository` provides `create` (auto-assigns per-session sequential number, defaults state=open, labels=["needs-triage"]) and `list_by_session` (returns issues ordered open-first then by number; domain timestamps are ISO strings via existing `epoch_millis_to_iso`)
- [ ] `IssueCreate` and `IssueList` command variants exist in the executor; IssueCreate emits `IssuesChanged`, IssueList emits nothing
- [ ] `CommandResult::Issue` and `CommandResult::Issues` variants exist
- [ ] Tauri `list_issues` read-only command handler registered in `generate_handler!`; `IssuesChanged` arm added to `emit_domain_events` (compile requirement; dead code in v1 since no Tauri command mutates issues)
- [ ] MCP `issue_create` and `issue_list` tools registered in `tool_box!`; `author` hardcoded `"ai"` for create
- [ ] Cross-cutting MCP wiring: `IssuesChanged` arm in `invoke_callbacks` with 4th `issues_cb` param; `on_issues_changed` field on `McpHandler`; feature-gated `make_session_id_callback` helper emitting `"issues-changed"` with `{ session_id }` payload; new `run_mcp_command!` macro arm for issue callbacks (existing tool call sites unchanged); `on_issues_changed` wired in `init()` (`None` when `tauri-integration` is off)
- [ ] `IssueTrackerPanel` React component registered as panel type `"issue-tracker"` (label "Issue Tracker"); fetches issues on mount via `list_issues`; listens to `"issues-changed"` filtered by `session_id`; shows empty state when no issues exist
- [ ] `src/App.tsx` side-effect imports `IssueTrackerPanel`
- [ ] TS `Issue` interface matches the serialized Rust struct (snake_case)
- [ ] Repository tests (in-memory SQLite): create assigns sequential #1 then #2; two sessions get independent numbering; labels default to `["needs-triage"]`; `list_by_session` returns only that session's issues ordered open-first
- [ ] Command event tests: `IssueCreate` emits `IssuesChanged { session_id }`; `IssueList` emits no event

## Blocked by

None — can start immediately.
