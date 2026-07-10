# Fix DAG graph rendering bugs

Labels: `ready-for-agent`

## Parent

`.scratch/git-tree-improvements/PRD.md`

## What to build

Fix three high-severity rendering bugs and one path-adjustment in the git graph DAG visualization in `src/panels/GitTreePanel.tsx`:

1. **Root commit lane termination**: In the `columnActivityRef` building code, root commits (no parents) currently mark their lane active for all subsequent rows (`for r = pos.row + 1; r < n; r++`). Change this to terminate the lane immediately — do not mark any subsequent rows active. A root commit's vertical line should end at its own row.

2. **Commit-row vertical line**: The `columnActivityRef` loop starts at `pos.row + 1`, meaning a commit's own row never has a vertical line passing through the dot. Change the loop to start at `pos.row` (include the current row) so the vertical line passes through the dot.

3. **Search topology preservation**: In `crates/git-operations/src/lib.rs`, update the `search_history` function's `git log` format string from `--format=%H|%an|%ae|%aI|%s` to `--format=%H|%P|%D` (matching `get_graph_topology`). In the frontend search `useEffect`, after search results arrive with topology-only data, call `get_commit_details` for the author/date/message fields (just like the main topology path). Merge results into the existing `commits` → `computeLanes` pipeline rather than bypassing topology.

4. **Connector path not overlapping commit dot**: Connectors currently start at `dotY` (same Y as the commit circle), causing visual overlap. Adjust the vertical line drawing so the source column's line stops at `dotY - DOT_RADIUS` and resumes at `dotY + DOT_RADIUS`, leaving a gap for the horizontal connector arm. Connector path starts from the gap edge rather than the dot center.

## Acceptance criteria

- [ ] Root commit lane terminates at its own row; no vertical line extends beyond it
- [ ] All commit rows show a vertical line passing through the commit dot (no gap)
- [ ] Search results show full graph topology (branch lines and connectors render correctly)
- [ ] Connector paths do not overlap commit dots
- [ ] Existing visual tests pass: linear history, branch, merge, octopus merge
- [ ] `npx tsc --noEmit` passes
- [ ] `cargo build` passes in `src-tauri`

## Blocked by

None — can start immediately
