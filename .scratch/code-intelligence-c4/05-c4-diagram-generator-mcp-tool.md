Status: done

# 05: C4 Diagram Generator MCP Tool

## What to build

The `generate_c4_diagram` MCP tool — a hybrid pipeline that uses tree-sitter for structural extraction and AI for semantic interpretation to produce a C4 architecture diagram. The diagram is persisted to the `c4_diagrams` table (from slice 01).

The tool accepts optional `scope` (path/module to focus on) and `max_depth` (1-4, defaults to 3) parameters. The AI can ask the user clarifying questions during generation (e.g., "Should I focus on the backend services?").

The generation pipeline:
1. Tree-sitter extracts structural data from the codebase (from the index in slice 02)
2. A deterministic pass groups components by directory and dependency patterns
3. The AI interprets and labels the semantic meaning (this is the "AI" part — the tool returns raw structural data and the AI agent constructs the C4 diagram with user input)

## Acceptance criteria

- [x] `generate_c4_diagram` MCP tool registered in `tool_box!`
- [x] Tool accepts optional `scope` parameter (string — path or module name to focus on)
- [x] Tool accepts optional `max_depth` parameter (integer 1-4, defaults to 3)
- [x] Tool queries the code intelligence index (slice 02) for structural data
- [x] Tool returns a structured C4 diagram (Nodes with level metadata, Edges, Groups) to the AI agent
- [x] The AI agent interprets the structural data, labels components semantically, and calls `C4DiagramCreate` to persist the result
- [x] Persisted diagram uses the `c4_diagrams` table from slice 01
- [x] Diagram contains all four C4 level types as metadata on nodes: `context`, `container`, `component`, `code`
- [x] Code-level nodes include `code_snippet` field with inline code
- [x] Tool handles missing index gracefully (returns error prompting user to index first, or triggers indexing automatically)
- [x] Tool scoped to a subdirectory returns only components within that scope

## Blocked by

- [01-c4-diagram-schema-and-repository.md](01-c4-diagram-schema-and-repository.md) — needs the `c4_diagrams` table and repository
- [02-code-intelligence-index-and-structural-mcp-tools.md](02-code-intelligence-index-and-structural-mcp-tools.md) — needs the structural index for tree-sitter data
