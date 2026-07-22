# ADR 0024: Remove Tree-sitter Code Intelligence

## Status

Accepted (supersedes the structural/lexical index portion of [ADR 0003](0003-codebase-mcp-full-scope.md); follows [ADR 0023](0023-remove-semantic-vector-search.md), which removed the vector layer of that same subsystem)

## Context

ADR 0003 gave this workspace its own code-intelligence subsystem: a tree-sitter parser (`ai-agent-workspace-code-intelligence`) that extracted symbols and call edges into a SQLite `code_index` table, served by a family of MCP tools (`keyword_search`, `find_definition`, `find_references`, `find_callers`, `find_callees`, `list_code_files`) and by `generate_c4_diagram`, which derived C4 structure from that index. ADR 0023 already removed the vector layer, leaving this structural/lexical index as the remaining bespoke parser.

Re-parsing a codebase to answer "where is this symbol / who calls it" is a solved problem that dedicated tools do better: LSP servers, `grep`/AST search built into coding agents, and index products like Sourcegraph/CodeGraph. Maintaining our own tree-sitter grammars and index (per-language parsers, fingerprinting, incremental reindex, a progress/cancel UI) is ongoing cost that duplicates those tools and goes stale on every edit — without differentiating this product.

The product's actual niche is **visualization**: canvases and point-in-time C4 architecture snapshots whose nodes link back to real source files. That value does not require us to parse code — the AI can explore the repository with its own tools and author the diagram directly.

## Decision

Remove the tree-sitter code-intelligence subsystem entirely and keep the tool visualization-only:

- Delete the `ai-agent-workspace-code-intelligence` crate (tree-sitter parser + `IndexStore`).
- Delete the index-backed MCP tools (`keyword_search`, `find_definition`, `find_references`, `find_callers`, `find_callees`, `list_code_files`) and `generate_c4_diagram`.
- Delete the `index_code` / `get_index_status` / `cancel_index` Tauri commands and the C4 panel's indexing UI.
- Stop creating the `code_index` table in the schema. Existing rows are left in place on old DBs (rebuildable, non-destructive; no drop migration).

C4 diagrams are now authored by the AI: it explores the repository with its own tools (e.g. `tree`, file reads) and calls `c4_diagram_create`, linking each node to its real source file via `file_path`. Diagram persistence, the canvas, node source references, and `read_file_range` are retained.

## Consequences

- Positive: removes a whole crate, its per-language grammars, and the index lifecycle (build/refresh/cancel/progress) — less to maintain, no stale-index results.
- Positive: sharpens scope to the visualization niche instead of competing with LSP/grep/Sourcegraph on parsing.
- Negative: no built-in symbol/reference/caller lookup and no auto-generated C4 seed. Callers that want structural facts must use a dedicated tool (LSP, CodeGraph, grep), and diagram authoring now leans on the AI's own exploration.
- Reversible: structural lookup can be reintroduced as an integration with an external indexer rather than a bespoke in-tree parser.
