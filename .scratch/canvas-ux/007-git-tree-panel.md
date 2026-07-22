# Git Tree Panel

Labels: `ready-for-agent` `Status: ready-for-agent`

## Parent

`.scratch/canvas-ux/map.md` — Canvas UX

## Reference

Zed git graph: https://github.com/zed-industries/zed/pull/44434

## Architecture

See [ADR 0016](../../.aw/adr/0016-git-graph-panel.md) for full design rationale.

### Data flow

```
git log --all --topo-order --format="%H|%P|%D"
    ↓
get_graph_topology → {sha, parent_hashes, refs}[]
    ↓
TypeScript greedy column lane assignment (port from CommitGraph computePosition.ts)
    ↓
React + SVG render (virtualized via @tanstack/react-virtual)
    ↓
get_commit_details (lazy, via git cat-file --batch, for visible viewport rows only)
```

### Layout

- **Top:** virtualized commit list with 5 resizable columns (Graph Canvas | Hash | Author | Message | Date) + search bar
- **Bottom:** Commit Detail Pane (toggleable/resizable split) showing metadata for selected commit
- Column widths persist to localStorage

### Selection → Diff dispatch

Click commit → `get_commit_diff` → dispatch diffs to Diff Viewer Panel via `viewer:open-diff-content` CustomEvent. Metadata (hash, author, date, message, files changed) shows in the Commit Detail Pane.

## What to build

### Backend (Rust)

1. **Extend `CommitInfo`** in `crates/git-operations/src/lib.rs`:
   - Add `parent_hashes: Vec<String>`
   - Add `refs: Vec<String>` (branch/tag/remote ref names pointing to this commit)
   - Both fields serializable via serde

2. **`get_graph_topology`** Tauri command:
   - Takes `session_id`, resolves working directory via `state.db.get_working_directory()`
   - Runs `git log --all --topo-order --format="%H|%P|%D" --max-count=<n>` (default 500, configurable)
   - Parses output: SHA, parent list (space-separated), ref decorations (e.g. `HEAD -> main, origin/main, tag: v1.0`)
   - Returns `Vec<CommitInfo>` (with `parent_hashes` and `refs` populated; author/date/message will be empty)

3. **`get_commit_details`** Tauri command:
   - Takes `session_id` and `shas: Vec<String>`
   - Runs `git cat-file --batch` via stdin with each SHA
   - Parses output into `Vec<CommitInfo>` with author, date, message populated
   - Lazy — only called for commits in the current viewport

4. Register both commands in the invoke handler macro

### Frontend (TypeScript/React)

5. **Lane assignment algorithm** in `src/panels/git/laneAssignment.ts`:
   - Port the greedy column algorithm from CommitGraph's `computePosition.ts` (~120 lines)
   - Input: `{sha, parent_hashes}[]` (topologically sorted)
   - Output: `{sha, column, row}[]`
   - Pure function, testable independently
   - 6+ tests covering: linear history, single branch, octopus merge, cross-branch merge, branch collapse

6. **Graph canvas rendering** — SVG `<path>` elements for branch lines, `<circle>` for commit dots, `<rect>`+`<text>` for ref labels. Rendered as the first column in each row.

7. **Rewrite `GitTreePanel.tsx`**:
   - Use app design tokens (CSS variables for fonts, spacing, colors) — no ad-hoc inline styles
   - Match visual language of File Tree, Terminal, and other existing panels
   - Split-pane layout: graph/list on top, commit detail pane on bottom
   - 5 resizable columns with drag handles
   - Column width persistence to localStorage
   - Show no content until data loads; loading indicator during fetch
   - Search bar at top: filter by keyword, author, date range
   - Arrow key navigation (up/down → move selection, Enter → open diff, Escape → clear)

8. **Commit Detail Pane** (bottom, toggleable):
   - Full hash (with copy button)
   - Author name + email
   - Date (absolute + relative)
   - Full commit message
   - Files changed list (from `git diff-tree --stat <hash>`)
   - Close/expand toggle

9. **Branch/tag/remote ref labels** rendered as colored pills on the graph column. HEAD indicator. Colors from 8-10 theme-compatible hues, keyed deterministically by branch's first commit SHA.

### Color palette generation

10. Branch line colors: cycle through 8 theme-compatible colors using CSS variables. Deterministic assignment by SHA hash of the branch's first commit.

## Acceptance criteria

- [ ] Git tree panel appears in panel type selector as "Git Tree"
- [ ] Panel loads with graph canvas column showing the git DAG (branch lines, commit dots, ref labels)
- [ ] 5 columns visible: Graph Canvas, Hash, Author, Message, Date
- [ ] Columns are resizable via drag handles, widths persist across sessions
- [ ] Virtual scrolling via `@tanstack/react-virtual` — handles 10K+ commits
- [ ] Two-phase loading: topology appears instantly, details fill in lazily for visible rows
- [ ] Arrow keys navigate selection up/down, Enter opens diff in Diff Viewer Panel, Escape clears
- [ ] Search bar filters commits by keyword/author/date in real-time
- [ ] Branch names, tags, and remote tracking branches shown as colored pill labels on graph
- [ ] Clicking a commit opens its diff in the Diff Viewer Panel AND shows metadata in the Commit Detail Pane
- [ ] Commit Detail Pane shows: full hash (copyable), author, date, full message, files changed
- [ ] Refresh button re-fetches graph topology
- [ ] Loading indicator during initial fetch
- [ ] Empty state when no commits exist
- [ ] All styling uses the app's design tokens (CSS variables) — matches existing panel visual language

## Blocked by

- `006-viewer-dispatch-extraction.md` (completed)

## Design tokens constraint

All styling must use the app's existing CSS variables for fonts, spacing, colors, and borders. No ad-hoc inline styles. Panel must look consistent with File Tree, Terminal, Issue Tracker, and other panels.

## Lane assignment algorithm reference

- CommitGraph `computePosition.ts`: https://github.com/liuliu-dev/CommitGraph
- tig `graph-v2.c`: canonical reference for edge cases
