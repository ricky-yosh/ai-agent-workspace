# ADR 0003: Full-Scope Codebase MCP with Tree-Sitter and LSP

## Status

Accepted

## Context

The Codebase MCP provides code intelligence to AI agents — file search, symbol lookup, references, callers/callees, and semantic search. Two approaches were considered:

- **Shallow:** File-level search via glob/grep, a simple directory tree map, and no language awareness. Fast to implement, but limited to text matching.
- **Full-scope:** Tree-sitter for language-aware symbol extraction, LSP integration for cross-file references and navigation, and semantic search. Substantially more engineering effort, but gives AI agents IDE-level code understanding.

The app's purpose is AI-human collaboration on software projects. Without deep code intelligence, the AI agent cannot autonomously explore a codebase — it must rely on the user to guide it. Full-scope code intelligence makes the AI a capable collaborator that can navigate, understand, and reason about code independently.

## Decision

The Codebase MCP will use **tree-sitter** for parsing and symbol extraction across supported languages and integrate with **language servers (LSP)** for cross-file references, callers/callees, and navigation.

This includes:
- `find_symbol` — locate definitions by name across the codebase
- `find_references` — find all usages of a symbol
- `find_callers` / `find_callees` — trace call graphs
- `semantic_search` — search code by intent, not just text
- `build_code_map` — generate a structural map of the codebase as Cards and Edges on the whiteboard

The MCP is a Rust crate that communicates with language servers via stdio and manages tree-sitter grammars per-language.

## Consequences

- Positive: AI agents can explore and understand codebases without user guidance — a core differentiator for the product.
- Positive: Tree-sitter and LSP are well-established ecosystems with grammar coverage for most popular languages.
- Negative: Embedding an LSP client adds significant implementation complexity (process management, protocol handling, multi-language coordination).
- Negative: Language support is gated by available tree-sitter grammars and LSP server availability — not all languages will be covered at launch.
- Negative: First-launch experience may be slow as tree-sitter grammars are fetched and language servers are discovered.
