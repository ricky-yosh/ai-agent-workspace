# ADR 0025: Consolidate MCP Tool Surface Around Agent Workflows

## Status

Accepted (continues the surface-reduction line of [ADR 0023](0023-remove-semantic-vector-search.md) and [ADR 0024](0024-remove-tree-sitter-code-intelligence.md))

## Context

After the code-intelligence and vector-search removals, the MCP server had settled at 35 tools spanning Issues, Canvas (nodes/edges/groups/tags/sources), C4 diagrams, and a residual cluster of repo/git utilities. Dogfooding the server as the consuming agent — building a real canvas, tagging, grouping, and managing issues — exposed three recurring problems, each matching a documented MCP anti-pattern (Anthropic, *Writing effective tools for AI agents*; MCP spec, *Tools*):

- **Tools that duplicate the host agent's own affordances.** `read_file_range`, `blame`, `search_history`, and `get_owners` do what any connected agent already does with its native file/git tools, in both embedded and standalone modes. They are pure redundancy and consume context on every turn.
- **Entity-CRUD mirroring instead of workflow tools.** Each canvas entity carried a full `create/list/get/update/delete` set. `*_get` was verified to return byte-identical output to the corresponding `*_list` element, so it is a second path to the same bytes. Tags and node sources were modelled as first-class addressable rows with their own `add/list/remove` triples, even though a tag is pure decoration (no colors, no tag-scoped queries) and a source is a plain reference — both are properly *fields on a Node*. Because they were separate tools, `canvas_import`'s batch efficiency collapsed the moment tags or sources were involved.
- **Response bloat.** Every response echoed `session_id`/`created_at`/`updated_at` (never used by the agent) and serialised `metadata` as a double-escaped string; `issue_list` returned every issue's full markdown `body`, the "dump everything" anti-pattern.

## Decision

Sharpen the scoping rule to **"mutate app-owned, UI-rendered state only"** — Issues, Canvas, and C4 diagrams. Anything the host agent can already do is out of scope.

- **Remove** the repo/git utilities (`read_file_range`, `blame`, `search_history`, `get_owners`), the redundant canvas `*_get` tools (`node_get`, `edge_get`, `group_get`, `canvas_get`), and `issue_close` (subsumed by `issue_update(state)`).
- **Fold sub-entities into Node fields:** `tags: string[]` and `sources: [...]` become fields settable through `node_create`, `node_update`, and `canvas_import`. Removes `tag_add/remove/list` and `node_source_add/list/remove`.
- **Keep `issue_get` and `c4_diagram_get`** — their payloads (markdown body, diagram JSON) are large enough that a targeted fetch is a real token saving; their `*_list` counterparts return summaries only.
- **Response hygiene** for all survivors: omit `session_id`/`created_at`/`updated_at` from agent-facing responses, return `metadata` as real JSON, and have mutating/deleting tools return an explicit ack (e.g. `{deleted: true, id}`) instead of empty output.

Net surface: 35 → ~20 tools, each mapping to a task an agent actually performs rather than a table it edits.

## Consequences

- Smaller, less confusing tool set: fewer overlapping tools for the agent to choose between, and less permanent context spent on tool definitions.
- `canvas_import` becomes the complete path to populate a canvas — nodes, edges, groups, tags, and sources in one all-or-nothing call.
- Tags lose first-class-row identity; safe today because they are decoration only. Reintroducing tag-scoped queries or per-tag animation later would require promoting them back to rows — a known, documented reversal cost.
- External agents that wired the removed git/file tools into their configs must fall back to their native equivalents. This is the intended outcome, not a regression.
- `read_file_range`'s removal does not affect C4 authoring: the agent reads code with its own file tools before writing `diagram_json`.
