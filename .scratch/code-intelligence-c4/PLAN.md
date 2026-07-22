# Plan: Code Intelligence MCP & C4 Diagram Visualization

Status: ready-for-agent

Two integrated features: (1) Code Intelligence MCP Tools that give the AI IDE-level code understanding — symbol navigation, semantic search, git history, ownership signals — with a repo-scoped persistent index, and (2) a C4 Diagram Panel that renders architecture diagrams with drill-down navigation through four C4 levels, using the shared Canvas renderer from Visual Canvas.

See [`.aw/CONTEXT.md`](../../.aw/CONTEXT.md) for vocabulary, [`.aw/adr/0015-c4-diagram-repo-scoped-persistence.md`](../../.aw/adr/0015-c4-diagram-repo-scoped-persistence.md) for the persistence decision, and [PRD.md](PRD.md) for full requirements.

## Resolved decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Persistence scope | Repo-scoped (keyed by `repo_path`) | Diagrams and index belong to the codebase, not a session. Survives session deletion. See ADR 0015. |
| Index staleness | Incremental via content fingerprints | Only changed files re-indexed. Cheap, deterministic. Same pattern as syntax highlighting cache. |
| Vector staleness | On-demand regeneration | Embedding computation is expensive. Regenerate when user/AI requests it. |
| C4 generation | Hybrid (tree-sitter + AI) | Tree-sitter extracts structure mechanically. AI adds semantic labels. Balances accuracy with cost. |
| Management | MCP for generation, panel UI for management | AI generates diagrams. User manages (list/delete/rename) through UI. No AI tokens on housekeeping. |
| Canvas reuse | Composition — extract shared CanvasRenderer | Visual Canvas and C4 Diagram Panel share 2D canvas, pan/zoom, node/edge rendering, rope effect. Different interaction layers on top. |

## Vertical slices

| # | Title | Type | Blocked by |
|---|-------|------|------------|
| 1 | C4 Diagram Schema & Repository | AFK | None |
| 2 | Code Intelligence Index + Structural MCP Tools | AFK | None |
| 3 | Git History & Ownership MCP Tools | AFK | None |
| 4 | Vector Store + Semantic Search MCP Tool | AFK | None |
| 5 | C4 Diagram Generator MCP Tool | AFK | 1, 2 |
| 6 | Shared Canvas Renderer | AFK | None |
| 7 | C4 Diagram Panel | AFK | 1, 5, 6 |

Slices 1-4 and 6 can be worked on in parallel. Slice 5 depends on 1 and 2. Slice 7 depends on 1, 5, and 6.

## Out of scope (v2+)

- Cross-service linking (HTTP/gRPC route ↔ call-site matching)
- Runtime traces (actual execution paths from production)
- Diagnostics (linter errors, warnings, security issues)
- Refactoring tools (rename, move, inline across files)
- Infra-as-code understanding (Docker, K8s, Terraform)
- Similarity detection (near-clone detection)
- Fresh documentation retrieval (library/API docs)
- Live-updating C4 diagrams
- Cross-repo intelligence
- CDC events for C4 diagram mutations
