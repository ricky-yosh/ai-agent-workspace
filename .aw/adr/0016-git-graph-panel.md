# ADR 0016: Git Graph Panel Architecture

## Status

Accepted

## Context

The Git Graph Panel visualizes commit history as a proper DAG — branch lines, merge forks, commit dots, ref labels — not a flat grouped list. The reference is Zed's git graph (PR #44434). The load-bearing choices are: how to load data without stalling on large repos, where to compute lane assignment, and what to render the graph with.

## Decision

- **Two-phase loading.** `get_graph_topology` runs `git log --all --topo-order` returning only `{sha, parents, refs}` (near-instant); `get_commit_details` lazily fetches author/date/message via `git cat-file --batch` for viewport rows only. Including full metadata in the first `git log` is markedly slower, so topology comes first — matching Zed.
- **Lane assignment in TypeScript.** The greedy-column algorithm (ported from tig/CommitGraph, handling octopus/cross-branch merges, collapses, and branch-outs) is ~2–5ms for 1,000 commits; moving it to Rust would add IPC serialization cost with no speed gain.
- **Pure SVG rendering** in the React tree. SVG gets native CSS-variable theming, React reconciliation, the existing `motion` animations, and `@tanstack/react-virtual` for 10K+ commits. Canvas was rejected (manual text layout, no CSS-var theming, imperative API); a canvas+HTML hybrid was rejected (fragile coordinate/row-height synchronization).

Presentation details (resizable columns, split detail pane, keyboard nav, search reusing `search_history`, deterministic SHA-keyed branch colors, dispatching diffs to the Diff Viewer Panel, design-token styling) follow the app's established panel patterns.

## Consequences

- Proper DAG visualization; two-phase loading keeps initial render fast on large repos; SVG reuses existing infrastructure; TS lane computation avoids IPC overhead.
- `CommitInfo` gains `parent_hashes`/`refs` and a new `get_commit_details` command is added.
- The lane algorithm must be tested against known edge cases (octopus merges, fast-forward chains, detached HEAD).
- `GitTreePanel.tsx` (a flat grouped list) is substantially rewritten into the DAG graph.
