# ADR 0014: CDC Event Log for MCP-Driven UI Animations

## Status

Accepted

## Context

The Issue Tracker panel displays a session's issues and must animate mutations (create, update, delete) in real time as the AI modifies them via MCP. Mutations flow through the standalone `aiaw-mcp-server` binary, which writes directly to SQLite. The Tauri app detects changes via a file watcher (`db-changed` event) and re-fetches the issue list.

The initial approach attempted to detect deletions by diffing the previous issue list against the newly fetched list, then applying CSS animations to the removed item before unmounting it. This failed repeatedly — CSS animations on data-driven React lists are fragile when state transitions cause reconciliation to reparent or unmount DOM nodes. After exploring CSS transitions, `element.animate()` in `useLayoutEffect`, and delayed `setState`, none produced a reliable exit animation.

A reliable exit animation requires the deleted item's data to still be available *after* the SQLite row is gone, and requires the animation to be driven declaratively from known change events rather than inferred from state diffs.

## Decision

Use a **Change Data Capture (CDC)** pattern: SQLite triggers write mutation events into a generic `change_events` table (keyed by `entity_type`/`entity_id`/`event_type` with a `payload_json` snapshot and a `processed_at` marker). Entity-specific `AFTER INSERT/UPDATE/DELETE` triggers capture the old and/or new row as JSON — crucially, the `AFTER DELETE` trigger preserves the full entity *after* its row is gone. The frontend reads unprocessed events after each `db-changed` notification and drives animations declaratively from the payload: enter/highlight for created/updated, and a reliable exit animation for deleted (rendered from the snapshot before marking the event processed). This replaces the fragile state-diffing approach and generalizes to any MCP-mutated entity.

## Consequences

- Exit animations become reliable: the event payload contains the full entity snapshot, and the animation is triggered by a known event rather than inferred from state comparison.
- The `change_events` table is generic (`entity_type` column), so adding support for future entities (workspaces, sessions, templates) requires only a new trigger — no schema migration.
- SQLite triggers fire atomically with the mutation, so no events are lost regardless of which process (MCP server, Tauri command, SQLite CLI) performs the write.
- Foreign key cascading deletes fire triggers on child tables, so deleting a session captures deletion events for all its issues.
- The existing `db-changed` file watcher continues to serve as the wake-up signal; only the consumption logic changes from state-diffing to event-log reading.
- Adds a new table, triggers, repository, and Tauri commands for event consumption. The `issues-changed` DomainEvent remains for in-app MCP plugin mutations that have active Tauri callbacks.
- Events accumulate until processed; a periodic cleanup or retention policy may be needed for long-running sessions with many mutations.
