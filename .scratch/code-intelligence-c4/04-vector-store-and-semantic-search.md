Status: ready-for-agent

# 04: Vector Store + Semantic Search MCP Tool

## What to build

A repo-scoped vector store that embeds code chunks (functions, classes, docstrings) for semantic search. The store persists across sessions keyed by `repo_path` and regenerates on demand (not incrementally — embedding computation is expensive).

Exposes one MCP tool: `search` — semantic search that finds code by intent, not text matching. The AI can ask "find authentication handling" and get back relevant code chunks ranked by similarity.

## Acceptance criteria

- [ ] `code_vectors` table exists keyed by `repo_path`, storing embedded code chunks with metadata (file path, symbol name, line range, embedding vector)
- [ ] New crate or module for vector store: embedding generation, storage, similarity search
- [ ] Embedding model integration (specific model TBD — use a local model if possible, or an API)
- [ ] `search` MCP tool registered in `tool_box!`: accepts a natural language query, returns ranked code chunks with file path, symbol name, and relevance score
- [ ] On-demand regeneration: a mechanism (MCP tool or automatic trigger) to rebuild the vector store for a repo
- [ ] Staleness handling: if vector store doesn't exist for a repo, `search` returns a clear message prompting regeneration
- [ ] `search` operates on the session's working directory repo
- [ ] Skip deterministic testing (embedding model dependency). Manual verification of search quality.

## Blocked by

None — can start immediately.
