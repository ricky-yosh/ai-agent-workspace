# ADR 0014: CDC Event Log for MCP-Driven UI Animations

## Status

Accepted

## Context

The Issue Tracker panel displays a session's issues and must animate mutations (create, update, delete) in real time as the AI modifies them via MCP. Mutations flow through the standalone `aiaw-mcp-server` binary, which writes directly to SQLite. The Tauri app detects changes via a file watcher (`db-changed` event) and re-fetches the issue list.

The initial approach attempted to detect deletions by diffing the previous issue list against the newly fetched list, then applying CSS animations to the removed item before unmounting it. This failed repeatedly — CSS animations on data-driven React lists are fragile when state transitions cause reconciliation to reparent or unmount DOM nodes. After exploring CSS transitions, `element.animate()` in `useLayoutEffect`, and delayed `setState`, none produced a reliable exit animation.

A reliable exit animation requires the deleted item's data to still be available *after* the SQLite row is gone, and requires the animation to be driven declaratively from known change events rather than inferred from state diffs.

## Decision

Use a **Change Data Capture (CDC)** pattern: SQLite triggers write mutation events into a generic `change_events` table. The frontend reads unprocessed events after each `db-changed` notification and drives animations from the event payload, which includes the full entity snapshot.

The `change_events` table:

```sql
CREATE TABLE change_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);
```

Entity-specific triggers fire on INSERT, UPDATE, and DELETE, writing the old and/or new row state as JSON into `payload_json`. For deletes, the `OLD` row is captured via `AFTER DELETE` triggers, ensuring the full entity data is preserved even though the source row no longer exists.

The frontend processes events in order after each `db-changed` notification: for `deleted` events it renders the entity from `payload_json` and plays an exit animation before marking the event as processed; for `created` and `updated` events it plays enter and highlight animations respectively.

This replaces the reactive state-diffing approach in `fetchIssues` for exit animations and provides a general pattern for any MCP-mutated entity that needs UI animations.

## Consequences

- Exit animations become reliable: the event payload contains the full entity snapshot, and the animation is triggered by a known event rather than inferred from state comparison.
- The `change_events` table is generic (`entity_type` column), so adding support for future entities (workspaces, sessions, templates) requires only a new trigger — no schema migration.
- SQLite triggers fire atomically with the mutation, so no events are lost regardless of which process (MCP server, Tauri command, SQLite CLI) performs the write.
- Foreign key cascading deletes fire triggers on child tables, so deleting a session captures deletion events for all its issues.
- The existing `db-changed` file watcher continues to serve as the wake-up signal; only the consumption logic changes from state-diffing to event-log reading.
- Adds a new table, triggers, repository, and Tauri commands for event consumption. The `issues-changed` DomainEvent remains for in-app MCP plugin mutations that have active Tauri callbacks.
- Events accumulate until processed; a periodic cleanup or retention policy may be needed for long-running sessions with many mutations.
