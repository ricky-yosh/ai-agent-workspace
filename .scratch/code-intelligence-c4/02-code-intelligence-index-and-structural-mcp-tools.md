Status: ready-for-agent

# 02: Code Intelligence Index + Structural MCP Tools

## What to build

The core code intelligence layer: a repo-scoped index built with tree-sitter that extracts symbols, definitions, references, call graphs, and file structure from the codebase. The index persists across sessions keyed by `repo_path` and updates incrementally using content fingerprints (only changed files re-indexed).

On top of this index, expose structural MCP tools: `keyword_search`, `find_definition`, `find_references`, `find_callers`, `find_callees`, `list_files`, and `read_file_range`. These tools let the AI navigate and understand a codebase at the symbol level.

This is the foundation that all other code intelligence features build on.

## Acceptance criteria

- [ ] `code_index` table exists keyed by `repo_path`, storing per-file symbol data (definitions, references, imports, call graph edges) and content fingerprints
- [ ] New crate (e.g., `crates/code-intelligence`) with tree-sitter integration for symbol extraction across supported languages (Rust, TypeScript as initial targets)
- [ ] Incremental indexing: on tool invocation, compare current file fingerprints against stored ones; only re-index changed files
- [ ] MCP tools registered in `tool_box!`:
  - `keyword_search` — exact keyword and regex search across indexed files
  - `find_definition` — go-to-definition for a symbol name
  - `find_references` — find all usages of a symbol
  - `find_callers` / `find_callees` — call graph traversal
  - `list_files` — directory structure and file listing
  - `read_file_range` — pull exact file ranges (line numbers)
- [ ] Tools query the session's working directory repo (resolved from session context)
- [ ] Index tests: given a Rust source file, verify extraction of function definitions, struct definitions, use statements, and function call edges
- [ ] Index tests: given a TypeScript source file, verify extraction of function definitions, import statements, and function call edges
- [ ] Incremental update test: modify one file, re-index, verify only that file's entries changed

## Blocked by

None — can start immediately.
