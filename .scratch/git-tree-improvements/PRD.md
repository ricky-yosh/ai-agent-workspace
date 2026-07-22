# PRD: Git Tree Panel — Rendering fixes, detail pane file tree, quick-open, range diff

## Problem Statement

A user browsing commit history in the Git Graph Panel sees a broken DAG visualization: root commit branch lines extend to the bottom of the viewport, there are gaps between commit dots and their vertical lines, and searching destroys the graph topology entirely. The lane assignment algorithm never recycles terminated columns, causing the graph to drift rightward over time, and colors are assigned per-column rather than per-branch — meaning a branch's color can change depending on which lane it occupies. Ref labels lack a HEAD indicator, `tag:` prefixes leak through, and long label lists overflow the graph column. The Commit Detail Pane shows a raw `--stat` text blob instead of a browsable file tree. There is no way to quickly navigate to a specific commit by SHA. Selecting multiple commits does not open a combined range diff in the Diff Viewer.

## Solution

Fix three high-severity rendering bugs in the DAG graph canvas (lane termination, per-row vertical lines, search topology preservation). Fix the lane assignment algorithm to recycle terminated columns and correctly handle octopus merges. Change branch color assignment from per-column to per-branch, using the branch-point SHA as the deterministic color key. Polish ref labels with a HEAD indicator, `tag:` prefix stripping, and overflow handling. Replace the raw `--stat` output in the Commit Detail Pane with a parsed file tree that shows directory hierarchy, additions/deletions per file, and a tree/flat view toggle (`Ctrl+T`). Add a `Cmd+Shift+O` commit quick-open modal that accepts a SHA, branch, or tag name and jumps to the match. Add contiguous commit selection (shift-click) that dispatches a combined range diff to the Diff Viewer Panel.

## User Stories

### Rendering fixes

1. As a git graph user, I want root commits (initial commit, orphan branches) to show a lane that terminates at their row rather than extending to the bottom of the viewport, so that the graph accurately reflects where branches begin and end.

2. As a git graph user, I want each commit row to show the continuation of its column's vertical line passing through the commit dot, so that there are no visual gaps where branch lines disconnect from their dots.

3. As a git graph user, I want the search bar to preserve the graph topology (branch lines and connectors), so that I can filter commits by keyword without losing the visual branch structure.

4. As a git graph user, I want the graph canvas to render correctly for all standard git topologies — linear history, simple branch, merge, octopus merge, and multiple parallel branches — so that I can trust the visualization regardless of repo shape.

### Lane assignment

5. As a git graph user, I want lanes to be recycled when a branch segment terminates, so that new branches appear in the earliest available canvas space rather than drifting indefinitely rightward.

6. As a git graph user, I want octopus merges (more than two parents) to be handled correctly by the lane algorithm, so that all parent columns are detected as branch-in points rather than misclassified.

### Branch colors

7. As a git graph user, I want each logical branch to have a consistent color across all its commits, even when the branch's lane changes due to lane recycling, so that I can visually follow a branch through its entire history.

### Ref labels

8. As a git graph user, I want the current branch's commit to show a HEAD indicator, so that I can immediately identify which commit is checked out.

9. As a git graph user, I want tag labels to show only the tag name (e.g., `v1.0`), without the `tag: ` prefix from git's raw output.

10. As a git graph user, I want ref labels to handle overflow gracefully when many refs point to the same commit, so that labels don't escape the graph column boundary.

### Commit Detail Pane file tree

11. As a git graph user, I want the Commit Detail Pane to show the list of changed files as a browsable tree with folder hierarchy, additions and deletions per file, and file status indicators, so that I can understand the scope of a commit at a glance.

12. As a git graph user, I want to toggle the file tree between tree view and flat view with `Ctrl+T`, so that I can switch views without leaving the keyboard.

13. As a git graph user, I want clicking a file in the detail pane file tree to dispatch that file's per-commit diff to the Diff Viewer Panel, so that I can inspect the actual changes in full detail.

### Commit quick-open

14. As a git graph user, I want to press `Cmd+Shift+O` and paste a commit SHA, branch name, or tag name, so that I can jump directly to a specific commit in the graph without scrolling.

15. As a git graph user, I want the quick-open modal to live-match against the loaded topology's SHAs and ref names as I type, so that I get immediate feedback about what the input resolves to.

16. As a git graph user, I want pressing Enter in the quick-open modal to select and scroll to the matching commit, so that I can navigate in one action.

### Contiguous selection and range diff

17. As a git graph user, I want to shift-click a commit to extend my selection to create a contiguous range, so that I can select a span of commits to examine as a group.

18. As a git graph user, I want the selected range to dispatch as a combined range diff (`git diff oldest^..newest`) to the Diff Viewer Panel, so that I can see all changes across the selected span in one unified view.

19. As a git graph user, I want the range diff title in the Diff Viewer to show the commit range (e.g., "abc1234..def5678"), so that I know which commits the diff covers.

## Implementation Decisions

### Rendering fixes

- Root commit lane termination: instead of marking the lane active for all subsequent rows, terminate it at the commit's own row (no vertical line extends beyond a root commit).
- Commit-row vertical line: mark the commit's own row as active in `columnActivityRef` so the vertical line passes through the dot. The loop should include the current row, not start at `pos.row + 1`.
- Search topology preservation: update the Rust `search_history` command's `git log` format string from `--format=%H|%an|%ae|%aI|%s` to `--format=%H|%P|%D` (matching `get_graph_topology`), and then follow up with `get_commit_details` for author/date/message just like the main topology path. The frontend search `useEffect` merges search results into the existing lane computation pipeline instead of replacing the topology.
- Connector paths: start at the commit dot's center `(dotX, dotY)` and draw the S-curve without overlapping the dot. The vertical line for the source column stops at `dotY - DOT_RADIUS` (above the dot) and resumes at `dotY + DOT_RADIUS` (below), clearing a gap for the horizontal connector arm.

### Lane assignment

- Add a `recycleColumn` step in `computeLanes`: before appending a new column, scan `columnSegments` for any segment whose `endRow < currentRow` (fully terminated). Reuse the first available.
- Fix `isBranchOut` to check all parent indices (`parent_hashes[0]`, `parent_hashes[1]`, ...) rather than only the first parent. A commit is a branch-out for parent `i` if the child commit's SHA appears in the parent's children list at index `i`.
- Add test cases: lane recycling after a short-lived branch, octopus merge with 3 parents, linear-only lane recycling.

### Branch colors

- Key branch color by the SHA of the commit where the branch first diverged from its parent (the branch point SHA). For the initial commit, use its own SHA.
- Store the branch-point SHA in `ComputeLanes` output alongside the column assignment.
- Update `getBranchColor` to take a branch-point SHA. The existing hash function and 10-color palette remain unchanged.
- A branch's branch-point SHA is stable: it's the commit SHA that first enters a new column during lane assignment. Track this in `columnSegments` alongside the start/end rows.

### Ref labels

- HEAD indicator: render a distinct marker (e.g., a bolder outline or a small triangle) on the commit dot of the HEAD branch. Detect HEAD by parsing `refs` array for the `HEAD ->` prefix, or by a separate HEAD SHA from the backend.
- `tag: ` prefix stripping: in the ref label rendering, strip `tag: ` from the ref name and apply a tag-colored pill. Keep branch and remote refs colored by their existing prefixes (`refs/heads/` → branch color, `refs/remotes/` → remote color).
- Ref label overflow: compute total label width (text width + pill padding) and clamp to the available graph column width. If labels overflow, truncate individual labels or show a `+N` overflow indicator.

### Commit Detail Pane file tree

- Parse `git diff-tree --stat` or `git diff-tree --numstat` output into structured file entries: `{ path: string, additions: number, deletions: number, status: "added" | "modified" | "deleted" }`.
- Build a directory tree from flat paths (splitting on `/`). Each directory node stores aggregated additions/deletions from its children.
- Render tree view using recursive indentation with collapsible directory nodes. Default: all directories collapsed, expanded only when clicked.
- Flat view: a simple list sorted by path, with directory prefixes grayed out and filename bolded (Zed-style).
- `Ctrl+T` toggles between tree and flat view. State is local to the detail pane instance (not persisted).
- Clicking a file dispatches: the file's diff (filtered from the commit's full diff) to the Diff Viewer Panel via `registry.dispatchDiffContent(fileDiff, fileName)`.

### Commit Quick-Open modal

- Invoked by `Cmd+Shift+O` while the Git Graph Panel is focused. Renders a centered modal overlay with a text input.
- Placeholder: "Search by commit SHA, branch, or tag..."
- Matching logic: live-filter `commits` array on every keystroke, matching against `hash` (starts-with), local branch names (from refs), remote branch names, and tag names. Debounce 150ms.
- Results shown as a flat list below the input. Each result shows: graph dot (color from branch), short hash, and first line of message for SHA matches; or ref name + short hash for branch/tag matches.
- Enter: navigates to and selects the first match, closing the modal. The virtual scroller scrolls the selected row into view.
- Escape: closes the modal without navigating.
- The modal does not change the diff viewer or detail pane — it only navigates the graph.

### Contiguous selection and range diff

- Add `selectionAnchor` state (the first-clicked row index) and `selectedRange` state (`[startRow, endRow]` tuple or null).
- Click: sets `selectionAnchor` and `selectedRange` to `[row, row]` (single commit).
- Shift+click: sets `selectedRange` to `[selectionAnchor, clickedRow]` (the max/min range), keeping all rows within highlighted.
- Arrow keys with shift held: extend the range by one row in the pressed direction.
- When a range is selected and the user opens the diff (Enter or click on the "Open Diff" action), compute `oldest..newest` from the selected SHAs and call `get_range_diff(oldestSha, newestSha)`.
- New Tauri command `get_range_diff(sessionId, oldestSha, newestSha)` runs `git diff oldestSha^..newestSha --stat -p`.
- Diff is dispatched to the Diff Viewer Panel via the existing `registry.dispatchDiffContent(diffContent, titleFormat)` with title `"abc1234..def5678"`.
- No new data model — range diff is transient (computed and displayed, not persisted).

## Testing Decisions

### What makes a good test
Tests assert external behavior (output, side effects) not implementation details (internal state shape, helper function calls). When input is deterministic, output must be deterministic. Rendering tests use DOM queries for visible elements, not React internals.

### Test seams (highest possible)

1. **`computeLanes()`** — pure function seam. Input: `CommitTopology[]`. Output: `CommitPosition[]`. Test:
   - Lane recycling: a topology where a branch ends, then a new branch starts — assert it reuses the freed column rather than appending.
   - Octopus merge: a commit with 3 parents is handled correctly (all parents detected as branch-in, no misclassification).
   - Root commits: lane terminates at row 0, no vertical continuation.
   - Existing tests continue to pass.

2. **`getBranchColor()`** — pure function seam. Input: branch-point SHA. Output: CSS variable name. Test:
   - Same branch-point SHA → same color.
   - Different branch-point SHAs → different colors (probabilistic, sample 100 SHAs).
   - Existing tests updated for new signature.

3. **`search_history`** — Rust command seam. Test:
   - Output includes non-empty `parent_hashes` and `refs` fields.
   - Topology can be passed through `computeLanes` without error.

4. **`get_range_diff`** — new Rust command seam. Test:
   - Returns combined diff output for `oldest^..newest`.
   - Handles single-commit range (equivalent to `git show`).

5. **SVG graph path computation** — extract pure function `computeGraphCells(topology, positions, columnColors) → { lines, connectors, dots, labels }[]`. Test:
   - Lane vertical lines match column activity (one line per active column per row).
   - Connectors draw between non-same-column parent/child pairs.
   - Root commits have no vertical line below their row.
   - Commit dots are centered in their lane.

6. **Commit detail file tree parser** — pure function. Input: `git diff-tree --numstat` output string. Output: `FileTreeEntry[]`. Test:
   - Parses additions/deletions correctly.
   - Builds correct directory nesting from flat paths.
   - Handles renamed files (R#### status code).

### Prior art
- `src/panels/git/laneAssignment.test.ts` (6 existing tests)
- `src/panels/git/branchColors.test.ts` (3 existing tests)
- `crates/git-operations/src/lib.rs` (existing `get_graph_topology` and `search_history` implementations)

## Out of Scope

- Non-contiguous commit selection (Ctrl+click multi-select). Deferred because every contiguous subset of a contiguous range is already visible in the range diff — non-contiguous subset diffs would be semantically misleading.
- Streaming/paginated graph loading. Current max-count=500 is adequate for v1. Chunked loading from Zed's architecture is a future optimization.
- Collab/remote repository support for the git graph.
- Inline diff expansion within the Commit Detail Pane file tree. Click dispatches to the Diff Viewer Panel only.
- Commit actions (checkout, cherry-pick, revert, branch from commit). These are v2 features.
- Column-fixed commit rows (the "graph column doesn't scroll horizontally with the text columns" problem). Separate issue.
- Color-blind accessible branch color palette configuration. The 10-color deterministic palette is adequate for v1.

## Further Notes

- The viewer dispatch pattern (Git Graph Panel → Diff Viewer Panel) mirrors File Tree → File Viewer Panel. Both use the same `ViewerRegistry` infrastructure.
- Branch colors were previously keyed by column index (the SHA of the first commit placed in a column). The change to branch-point SHA is the semantically correct approach and has no user-visible breaking changes — users haven't been told what the color mapping means.
- The `tag: ` prefix originates from `git log --format=%D` where annotated tags are rendered as `tag: v1.0, tag: v2.0`. Lightweight tags appear without the prefix.
- The commit quick-open modal follows the command-palette pattern already used by PanelActionsModal and SessionActionsModal in the codebase, but with a custom input for commit navigation rather than a static list.
