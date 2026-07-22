# Consolidate MCP tool surface around agent workflows

Labels: `ready-for-agent`

Governed by [ADR 0025](../../.aw/adr/0025-consolidate-mcp-tool-surface.md).

## Problem Statement

As an AI agent connected to the AI Agent Workspace MCP server, I face a bloated, confusing tool surface. There are 35 tools, many of which either duplicate capabilities I already have, offer redundant paths to the same data, or force me into tedious multi-call sequences for simple intent. Concretely, when I use the server today:

- I see repo/git tools (`read_file_range`, `blame`, `search_history`, `get_owners`) that do exactly what my own native file and git tools already do — dead weight loaded into my context on every turn.
- Every canvas entity has both a `*_list` and a `*_get`, and the `*_get` returns byte-for-byte the same object as the corresponding list element — a second path I have to reason about for no gain.
- Tags and node sources are modelled as first-class rows with their own `add`/`list`/`remove` tool triples. Tagging a node with two tags is two calls; building one tagged node via `canvas_import` is impossible because the batch tool can't set tags at all. The efficiency promise of `canvas_import` collapses the moment decoration is involved.
- Every response echoes `session_id`, `created_at`, and `updated_at` (which I never use) and serialises `metadata` as a double-escaped string. `issue_list` returns every issue's full markdown body, flooding my context on a real backlog.
- Delete tools return empty output, so I cannot tell whether a deletion succeeded without issuing another list call.

## Solution

Sharpen the MCP server's scope to a single rule — **it mutates app-owned, UI-rendered state only** (Issues, Canvas, C4 diagrams) — and reshape the tools so each one maps to a task an agent actually performs rather than mirroring a database table.

From the agent's perspective after this change:

- The tool list is ~20 tools instead of 35, with no near-duplicates to choose between.
- Nothing in the tool set duplicates my own file/git capabilities.
- I set a node's tags and sources inline when I create or update it — including inside a single `canvas_import` call — so populating a canvas is genuinely one round-trip.
- List responses are lean indexes; I fetch a full body or diagram only when I need it.
- Responses carry only fields I use, `metadata` is real nested JSON, and every mutation (including deletes) returns an explicit acknowledgement.

## User Stories

1. As an AI agent, I want the MCP server to expose only operations on app-owned state, so that I am not distracted by tools that duplicate my own file and git capabilities.
2. As an AI agent, I want `read_file_range` removed, so that I read files with my own tools and don't maintain two mental models of file access.
3. As an AI agent, I want `blame`, `search_history`, and `get_owners` removed, so that git intelligence comes from my own git tools in one consistent place.
4. As a maintainer, I want the MCP crate's dependency on `crates/git-operations` dropped, so that the git-utility code path exists only where it is still used (the Git Graph panel via Tauri).
5. As an AI agent, I want the redundant `node_get`, `edge_get`, `group_get`, and `canvas_get` tools removed, so that there is one obvious way to read canvas entities.
6. As an AI agent, I want `issue_get` and `c4_diagram_get` kept, so that I can fetch a single large payload (markdown body, diagram JSON) without pulling the whole list.
7. As an AI agent, I want `issue_close` removed in favour of `issue_update(state:"closed")`, so that state transitions have a single canonical tool.
8. As an AI agent, I want to set a node's tags when I create it, so that a categorised node takes one call, not many.
9. As an AI agent, I want to set a node's tags when I update it, so that I can re-categorise without touching a separate tag subsystem.
10. As an AI agent, I want to set node tags inside `canvas_import`, so that batch-populating a canvas with categorised nodes stays a single all-or-nothing call.
11. As an AI agent, I want `tag_add`, `tag_remove`, and `tag_list` removed, so that tags are simply a field I read off the node.
12. As an AI agent, I want to attach a node's source references when I create or update it, so that sources travel with the node rather than through a separate CRUD triple.
13. As an AI agent, I want to set node sources inside `canvas_import`, so that a fully-sourced canvas is one call.
14. As an AI agent, I want `node_source_add`, `node_source_list`, and `node_source_remove` removed, so that sources are a node field, not a subsystem.
15. As an AI agent, I want responses to omit `session_id`, `created_at`, and `updated_at`, so that I spend no context reading fields I never use.
16. As an AI agent, I want `metadata` returned as real nested JSON, so that I don't have to unescape a string to read it.
17. As an AI agent, I want `issue_list` to return summaries only (`number`, `title`, `labels`, `state`), so that listing a large backlog doesn't flood my context with every body.
18. As an AI agent, I want `c4_diagram_list` to return metadata only (not inline diagram JSON), so that listing diagrams is cheap and I fetch the JSON via `c4_diagram_get` when needed.
19. As an AI agent, I want every delete tool to return an explicit `{deleted: true, id}` acknowledgement, so that I can confirm success without a follow-up list call.
20. As an AI agent, I want every mutating tool to return a meaningful acknowledgement of what changed, so that I can close the loop on each action.
21. As a human using the Visual Canvas, I want my existing tags and sources preserved when they become node fields, so that no data is lost in the migration.
22. As a human using the Issue Tracker, I want closing an issue via the AI to keep working, so that the removal of `issue_close` is invisible to me.
23. As an external-tool user (Cursor, standalone `claude`), I want the removed git/file tools to degrade to my own equivalents, so that losing them does not break my workflow.

## Implementation Decisions

- **Scope rule.** The MCP server mutates app-owned, UI-rendered state only: Issues, Canvas (with its nodes/edges/groups), and C4 diagrams. Capabilities the host agent already possesses are out of scope. This is recorded in ADR 0025 and the domain `CONTEXT.md`.
- **Single tool registry.** All changes are made in the one `McpHandler` tool set and its `rmcp::tool_box!(McpHandler { ... })` registry. Both run modes (embedded Tauri plugin, standalone `aiaw-mcp-server`) inherit the change automatically — no per-mode work.
- **Tools removed:** `read_file_range`, `blame`, `search_history`, `get_owners`, `node_get`, `edge_get`, `group_get`, `canvas_get`, `issue_close`, `tag_add`, `tag_remove`, `tag_list`, `node_source_add`, `node_source_list`, `node_source_remove`. Remove each tool's `tool_box!` entry so it disappears from the advertised schema.
- **git-operations decoupling.** Drop the MCP crate's use of `ai_agent_workspace_git_operations`. The `crates/git-operations` crate itself stays — the Git Graph panel consumes it via Tauri.
- **Tags become a Node field.** A `Tag` is a decorative string; it is now a `tags: string[]` field on the Node, not a first-class addressable row. Settable via `node_create`, `node_update`, and `canvas_import`. Node reads return `tags` inline. Tag changes emit a Node `updated` `DomainEvent`/CDC `ChangeEvent` (no dedicated tag event). See the amended `Tag` definition in `CONTEXT.md`.
- **Node sources become a Node field.** A source reference is a `sources` array on the Node (each entry: `url`, `source_type`, `sort_order`). Settable via `node_create`, `node_update`, and `canvas_import`. Node reads return `sources` inline.
- **`canvas_import` completeness.** The per-node object in `canvas_import` gains optional `tags` and `sources`, so a batch import can produce fully-categorised, fully-sourced nodes in one all-or-nothing call. The existing `ref`/`node_refs` semantics are unchanged.
- **Schema migration.** Add a schema version bump that (a) adds `tags` and `sources` storage to the node representation, (b) copies existing tag rows into their owning node's `tags`, (c) copies existing node-source rows into their owning node's `sources`, then (d) drops the now-unused tag and node-source tables. Migration follows the existing rusqlite sync migration pattern (ADR 0022).
- **Response shaping.** Introduce/extend the shared response-formatting path (the existing `format_response`/`ResponseFormat` helper) so agent-facing payloads omit `session_id`, `created_at`, `updated_at`; emit `metadata` as nested JSON rather than an escaped string; and return explicit acknowledgements from mutating and deleting tools (`{deleted: true, id}` for deletes; the changed entity or an explicit change summary for updates). The Tauri/UI-facing read path is unaffected and keeps timestamps.
- **List/detail split.** `issue_list` returns a summary projection (`number`, `title`, `labels`, `state`); `issue_get` remains the full-body fetch. `c4_diagram_list` returns metadata only; `c4_diagram_get` remains the JSON fetch. Canvas entity lists continue to return full (but de-bloated) objects, since those records are small and the agent reasons over the whole canvas.

## Testing Decisions

- **What makes a good test here:** exercise the MCP tools through their external behaviour — call a tool method on `McpHandler` and assert on the returned `CallToolResult` text and on observable database state via the repositories. Do not assert on internal call sequences, private helpers, or event-callback wiring beyond the fact that the documented `DomainEvent` is produced.
- **Seam:** the single existing in-process seam — the `#[cfg(test)] mod tests` in the MCP crate, using the current `setup()` (real `McpHandler` over a `tempfile` temp-DB `Database`) and `extract_text()` helpers. No new seam is introduced; tests do not go over the stdio JSON-RPC transport (that would test `rmcp` plumbing, not our tools).
- **Modules tested:** the `McpHandler` tool methods for issues, canvas, nodes (including the new `tags`/`sources` fields), edges, groups, `canvas_import`, and C4 diagrams; and the shared response-formatting path.
- **Prior art:** the existing error-mapping tests in the same `mod tests` (`test_error_code_not_found`, etc.) establish the `setup()`/`extract_text()` pattern to extend.
- **Coverage to add:**
  - Setting `tags`/`sources` via `node_create`, `node_update`, and `canvas_import`, and reading them back off the node.
  - `canvas_import` producing categorised, sourced nodes plus edges/groups in one call, all-or-nothing on validation failure.
  - `issue_update(state:"closed")` closing an issue (replacing `issue_close`).
  - Removed tools are absent from the advertised tool set.
  - Response shape: no `session_id`/timestamps in agent-facing payloads; `metadata` is nested JSON; deletes return `{deleted: true, id}`; `issue_list` omits `body` while `issue_get` includes it.
  - A migration test: seed a DB at the prior schema version with tag and node-source rows, run the migration, assert the data now lives on the nodes and the old tables are gone.

## Out of Scope

- Reintroducing tag colors, tag-scoped queries, or per-tag animation — tags remain pure decoration in v1. Promoting them back to first-class rows is a documented, deliberate future reversal cost (ADR 0025).
- Any change to the Git Graph panel or its Tauri consumption of `crates/git-operations`.
- Namespacing/prefixing the remaining tools (e.g. `canvas.*`, `issue.*`). Worth considering later, but not part of this consolidation.
- Pagination of canvas entity lists — deferred until a canvas is large enough to warrant it.
- Changes to session resolution (ADR 0009/0011) or the embedded-vs-standalone architecture.

## Further Notes

- This continues the surface-reduction line of ADR 0023 (vector search) and ADR 0024 (tree-sitter code intelligence); ADR 0025 records the decision and its rationale.
- The design was validated by dogfooding the live server as the consuming agent: `canvas_import` was confirmed as the model workflow tool, `node_get`/`issue_get` were confirmed byte-identical to their list elements, and the tag/source multi-call friction and response bloat were felt directly.
- `read_file_range`'s removal does not affect C4 authoring — the agent reads code with its own file tools before hand-writing `diagram_json`.
