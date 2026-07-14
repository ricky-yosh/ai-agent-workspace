# ADR 0004: Remove Semantic (Vector) Search

## Status

Accepted (supersedes the `semantic_search` portion of [ADR 0003](0003-codebase-mcp-full-scope.md))

## Context

ADR 0003 included semantic search — a repo-scoped vector index of code-chunk embeddings (`code_vectors`), served by the `vector_search` MCP tool and built/refreshed by `reindex_vectors`. In practice this subsystem was the single worst source of resource consumption: building the index loads a hundreds-of-MB ONNX embedding model (`fastembed`) and re-embeds the repo, which produced ~20GB RAM, sustained ~90% CPU, and heavy disk writes. A series of optimizations (bounded batches, packed-BLOB storage, incremental fingerprinting, off-runtime execution) made it cheaper but did not change the fundamental cost/benefit.

Two facts drove the decision to remove it rather than keep optimizing:

1. **Low marginal value here.** Tracing consumers showed `vector_search` is the *only* reader of `code_vectors`. The agent already has always-fresh lexical and structural search over the (cheap) symbol index — `keyword_search`, `find_definition`, `find_references`, `find_callers`, `find_callees`, `list_code_files`. For an actively-edited local workspace, a vector index goes stale on every edit and can return code that was renamed or deleted, while filesystem/symbol search is always current.
2. **Industry alignment.** The broader coding-agent ecosystem moved the same way: Anthropic removed vector search from Claude Code (May 2025), and tools like Cursor and Devin lead with grep + AST search, treating embeddings as an optional escalation only for large, *stable* corpora. The recommendation is to add embeddings where the workload genuinely demands them (semantic generalization over big stable codebases) and skip them otherwise.

## Decision

Remove the semantic/vector search subsystem entirely:

- Delete the `vector_search` and `reindex_vectors` MCP tools.
- Delete the `ai-agent-workspace-vector-store` crate (and with it the `fastembed`/ONNX runtime).
- Drop the `code_vectors` table via a schema migration (v18 → v19); it held only rebuildable data.

Code intelligence continues via tree-sitter/LSP structural search and lexical search over the symbol index.

## Consequences

- Positive: eliminates the primary source of memory/CPU/disk pressure; the agent can no longer spend the user's resources embedding a codebase.
- Positive: retrieval is always fresh (no stale-index results) and requires no index maintenance on a churning repo.
- Negative: loses semantic ("by intent") retrieval for conceptual queries. Acceptable given the workspace profile (small, actively edited, well served by lexical + structural search).
- Reversible: if a future workload needs it (e.g. a large stable corpus), semantic search can be reintroduced — preferably behind an explicit user action rather than autonomous agent-triggered embedding.
