# ADR 0003: Full-Scope Codebase MCP with Tree-Sitter and LSP

## Status

Accepted (semantic-search portion superseded by [ADR 0023](0023-remove-semantic-vector-search.md))

## Context

The Codebase MCP provides code intelligence to AI agents — file search, symbol lookup, references, and callers/callees. Two approaches were considered:

- **Shallow:** File-level search via glob/grep, a simple directory tree map, and no language awareness. Fast to implement, but limited to text matching.
- **Full-scope:** Tree-sitter for language-aware symbol extraction and LSP integration for cross-file references and navigation. Substantially more engineering effort, but gives AI agents IDE-level code understanding.

The app's purpose is AI-human collaboration on software projects. Without deep code intelligence, the AI agent cannot autonomously explore a codebase — it must rely on the user to guide it. Full-scope code intelligence makes the AI a capable collaborator that can navigate, understand, and reason about code independently.

## Decision

Use **tree-sitter** for parsing and symbol extraction across supported languages, and integrate with **language servers (LSP)** for cross-file references, callers/callees, and navigation. Tools cover `find_symbol`, `find_references`, `find_callers`/`find_callees`, and `build_code_map` (a structural map of the codebase rendered as Nodes and Edges on the Visual Canvas). The MCP is a Rust crate that talks to language servers via stdio and manages tree-sitter grammars per-language.

(Semantic/vector search — originally part of this decision — was later removed; see [ADR 0023](0023-remove-semantic-vector-search.md).)

## Consequences

- Positive: AI agents can explore and understand codebases without user guidance — a core differentiator for the product.
- Positive: Tree-sitter and LSP are well-established ecosystems with grammar coverage for most popular languages.
- Negative: Embedding an LSP client adds significant complexity (process management, protocol handling, multi-language coordination).
- Negative: Language support is gated by available grammars and LSP servers — not all languages covered at launch.
- Negative: First launch may be slow as grammars are fetched and language servers discovered.
