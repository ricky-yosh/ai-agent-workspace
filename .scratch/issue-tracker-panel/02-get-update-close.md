Status: ready-for-agent

# 02: Get, update, close

## What to build

Add issue detail retrieval, partial updates, and close/reopen on top of the foundation from slice 01. The AI can update an issue's title, body, labels, or state; close and reopen issues; and the panel shows full issue details with state badges, labels, and open-first ordering.

## Acceptance criteria

- [ ] `IssueRepository` provides `get` (by id), `update` (partial fields, advances `updated_at`), and `close` (sets state to `closed`, advances `updated_at`)
- [ ] `IssueGet`, `IssueUpdate`, `IssueClose` command variants exist; all three emit `IssuesChanged`
- [ ] Tauri `get_issue` read-only command handler registered
- [ ] MCP `issue_get`, `issue_update`, `issue_close` tools registered; `issue_update` and `issue_close` use the callback arm; `issue_get` uses the no-callback arm
- [ ] Panel supports click-to-expand an issue showing its markdown body
- [ ] Panel shows a state badge (open/closed) on each issue
- [ ] Panel shows labels on each issue
- [ ] Panel orders issues open-first (all open issues before all closed)
- [ ] Repository tests (in-memory SQLite): get returns the correct issue; partial update changes only supplied fields and advances updated_at; close sets state to closed and advances updated_at; reopen via update sets state back to open; labels round-trip correctly including ad-hoc labels like "bug"; updated_at equals created_at on initial create

## Blocked by

- 01-create-and-view
