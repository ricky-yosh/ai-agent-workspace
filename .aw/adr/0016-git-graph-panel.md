# ADR 0016: Git Graph Panel Architecture

## Status

Accepted

## Context

The Git Tree Panel needs to visualize git commit history as a proper DAG (Directed Acyclic Graph) — branch lines, merge forks, commit dots, ref labels — not just a flat grouped list. The reference is Zed's git graph (PR #44434), which uses a canvas-rendered graph column alongside resizable text columns.

Key decisions span: data loading (topology vs. details), lane computation location, rendering technology (SVG vs. canvas), column layout, keyboard navigation, search, and ref label display.

## Decision

### Data Loading: Two-Phase

1. **Phase 1 (topology):** `get_graph_topology` Tauri command runs `git log --all --topo-order --format="%H|%P|%D"`. Returns `{sha, parent_hashes, refs}[]`. Fast — no author/date/message in the output.
2. **Phase 2 (details):** `get_commit_details` Tauri command fetches author, date, and message for a set of SHAs. Runs `git cat-file --batch` for on-demand lazy loading when commits scroll into the viewport.

This two-phase approach matches Zed's architecture. `git log` is significantly slower when including full commit metadata; extracting topology first makes initial load near-instant.

### Lane Computation: TypeScript (Greedy Column Algorithm)

Lane assignment (the "greedy column" algorithm from tig/CommitGraph) runs in TypeScript. The computation is ~2-5ms for 1,000 commits — putting it in Rust adds IPC serialization overhead without a speed benefit. The algorithm port from `commit-graph`'s `computePosition.ts` (~120 lines) is clean and well-tested.

The algorithm handles: octopus merges, cross-branch merges, branch collapses (when a branch ends), and branch-out (when a new branch forks).

### Rendering: Pure SVG

SVG rendering in the existing React component tree. Reasons:
- CSS variable theming works natively (`var(--text-primary)`, etc.)
- React reconciliation for commit rows
- `motion` library already in use for animations
- `@tanstack/react-virtual` for viewport virtualization (handles 10K+ commits without performance degradation)
- The existing CanvasRenderer already proves SVG performance at scale

Canvas was rejected: manual text layout, no CSS variable theming, imperative API incompatible with React's render cycle. Hybrid (canvas graph + HTML table) was rejected: alignment synchronization between canvas coordinates and HTML row heights is notoriously fragile.

### Columns: Graph + Hash + Author + Message + Date

Five resizable columns with drag-handle separators. Widths persist to localStorage. Columns (left to right):
1. **Graph Canvas** — SVG-rendered DAG: branch lines (`<path>`), commit dots (`<circle>`), ref labels (pill-shaped `<text>` on `<rect>`)
2. **Hash** — Abbreviated 7-char SHA
3. **Author** — Author name
4. **Message** — Commit message (first line)
5. **Date** — Relative date ("2 hours ago")

### Panel Layout: Split Pane

Top portion: virtualized commit list with graph column + text columns. Bottom portion: Commit Detail Pane showing metadata (full hash, author, date, message, files changed) when a commit is selected. Toggleable/resizable split.

### Keyboard Navigation

Arrow keys up/down move selection highlight. Enter opens diff for selected commit in the Diff Viewer Panel. Escape clears selection. Focus trapped within the panel when active.

### Search

Search bar at top of panel. Filters commit list in real-time by keyword, author, or date range. Reuses existing `search_history` Tauri command. Highlights matches in the message column.

### Ref Labels

Branch names, tags, and remote tracking branches shown as colored pill labels on the graph column. HEAD indicator present. Colors cycle through 8-10 theme-compatible hues keyed by branch's first commit SHA (deterministic).

### Color Assignment

Branch lines cycle through 8-10 colors from the app's CSS variable palette, keyed by the SHA of the first commit on each branch. Deterministic — the same branch always gets the same color.

### Commit Detail Dispatch

Clicking a commit sends the diff to the Diff Viewer Panel via `viewer:open-diff-content` CustomEvent. Commit metadata (hash, author, date, message, files changed) displays in the Git Tree Panel's Commit Detail Pane — the diff content is separate from the metadata.

### Design Tokens

All styling must use the app's existing CSS variables for fonts, spacing, colors, and borders — no ad-hoc inline styles. Matches the visual language of the File Tree, Terminal, and other panels.

## Consequences

- **Positive:** Proper git DAG visualization matching user expectations from other editors.
- **Positive:** Two-phase loading makes initial render fast even for large repos.
- **Positive:** SVG rendering leverages existing infrastructure (CSS vars, React, motion, react-virtual).
- **Positive:** TypeScript lane computation avoids IPC overhead for a lightweight algorithm.
- **Negative:** Resizable columns + split pane + virtual list + search requires careful coordinate tracking.
- **Negative:** `CommitInfo` struct must be extended with `parent_hashes` and `refs`, and a new `get_commit_details` command must be added.
- **Negative:** Lane assignment algorithm must be ported and tested against known edge cases (octopus merges, fast-forward chains, detached HEAD).
- **Negative:** The existing `GitTreePanel.tsx` must be substantially rewritten (current implementation is a flat grouped list, not a DAG graph).
