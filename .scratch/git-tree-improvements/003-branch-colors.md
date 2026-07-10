# Branch colors by branch identity

Labels: `ready-for-agent`

## Parent

`.scratch/git-tree-improvements/PRD.md`

## What to build

Change branch color assignment from per-column to per-branch. Currently `getBranchColor` is called with the SHA of the first commit placed in a column. Instead, it should be keyed by the **branch-point SHA** — the commit SHA where the branch diverges from its parent.

Changes:

1. **Track branch-point SHA** in `computeLanes` output. When a commit starts a new column (because it has no children, or is a branch-out to a new column), record the commit's SHA as the `branchSha` for that column segment. When a column is recycled, the new segment gets its own `branchSha` (the new branch-point commit's SHA). Store this in `CommitPosition` or a parallel `columnBranchIds` map.

2. **Update `getBranchColor`** in `src/panels/git/branchColors.ts` to accept a branch-point SHA (signature already works — just the call site changes). The hash function and 10-color palette remain unchanged.

3. **Update `GitTreePanel.tsx`** column color assignment: use the column's current segment's `branchSha` instead of "first commit SHA in column." When a column is recycled, its color changes to the new branch's color.

4. **Update tests** in `src/panels/git/branchColors.test.ts` to verify per-branch behavior: same branch-point SHA → same color, different branch-point SHAs → likely different colors.

## Acceptance criteria

- [ ] A branch's color stays consistent across all its commits when the column changes (e.g., after lane recycling)
- [ ] When a column is recycled for a new branch, the new branch gets a different color
- [ ] Colors remain deterministic (same branch-point SHA → same color every time)
- [ ] All existing branch color tests pass
- [ ] `npx tsc --noEmit` passes

## Blocked by

Depends on issue 002 (lane recycling). Branch color per-branch is meaningless without column recycling.
