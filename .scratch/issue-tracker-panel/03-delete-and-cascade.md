Status: ready-for-agent

# 03: Delete and cascade

## What to build

Add issue deletion and session cascade cleanup. The AI can delete an issue; deleting a session automatically removes all its issues via ON DELETE CASCADE.

## Acceptance criteria

- [ ] `IssueRepository` provides `delete` (by id)
- [ ] `IssueDelete` command variant exists; emits `IssuesChanged`
- [ ] MCP `issue_delete` tool registered (uses the callback arm)
- [ ] Deleting a session cascades to remove all its issues (ON DELETE CASCADE established in slice 01's schema)
- [ ] Panel handles gracefully when an issue it was displaying is deleted (no crash; list refreshes via the `issues-changed` event)
- [ ] Repository tests (in-memory SQLite): delete removes the issue; deleting a session removes all its issues (cascade); `list_by_session` returns empty after session delete
- [ ] Concurrency note: if two concurrent creates race on `MAX(number)+1`, the `UNIQUE(session_id, number)` index rejects the duplicate and the operation fails loudly rather than corrupting data

## Blocked by

- 01-create-and-view
