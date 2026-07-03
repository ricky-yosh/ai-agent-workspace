# Plan: Visual Canvas

Status: ready-for-agent

A Visual Canvas panel type that provides an infinite 2D canvas with Nodes, Edges, Groups, and Tags. The AI can create, read, update, and delete all canvas elements via MCP tools. The canvas uses the existing CDC event system for responsive animations when the AI makes changes.

See [`.aw/CONTEXT.md`](../../.aw/CONTEXT.md) for vocabulary and [PRD.md](PRD.md) for full requirements.

## Resolved decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Storage | SQLite (app-support DB), session-scoped | Matches existing pattern for Issues. Structured, queryable, persists across sessions. |
| Canvas type | Infinite canvas with pan/zoom | Standard for modern whiteboard tools. Matches Clapet behavior. |
| Group membership | Explicit `node_ids` array | Deterministic for AI. UI handles spatial containment detection. |
| Tags | Simple strings on Nodes only | Simpler than structured tags. Can add colors later. |
| Animations | CDC events for AI-driven mutations | Consistent with existing pattern. Gives clear visual feedback. |
| Undo/redo | Command system enables reversal | All commands are serializable and return DomainEvents. |

## Vertical slices

| # | Title | Type | Blocked by |
|---|-------|------|------------|
| 1 | Create and view canvas | AFK | None |
| 2 | Create and view nodes | AFK | 1 |
| 3 | Move nodes on canvas | AFK | 2 |
| 4 | Create and view edges | AFK | 2 |
| 5 | Create and view groups | AFK | 2 |
| 6 | Add and view tags | AFK | 2 |
| 7 | Delete entities | AFK | 2, 4, 5, 6 |
| 8 | Pan and zoom canvas | AFK | 1 |
| 9 | Edit node content inline | AFK | 2 |
| 10 | CDC events for AI mutations | AFK | 1, 2, 4, 5, 6 |
| 11 | Undo/redo for canvas operations | AFK | 1, 2, 4, 5, 6 |
| 12 | Multi-select nodes | AFK | 2, 3 |

## Out of scope (v1)

- Comments or annotation system on canvas elements
- Real-time collaboration between multiple users
- Canvas sharing or publishing
- Import/export functionality
- Minimap or overview panel
- Grid snapping
- Node color customization
- Node resizing
- Canvas templates
- Integration with external diagram tools
