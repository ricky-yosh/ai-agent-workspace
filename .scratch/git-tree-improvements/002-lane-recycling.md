# Lane recycling and octopus merge fix

Labels: `ready-for-agent`

## Parent

`.scratch/git-tree-improvements/PRD.md`

## What to build

Fix two issues in `src/panels/git/laneAssignment.ts`:

1. **Lane recycling**: Before creating a new column (currently `columnSegments.push(...)` or equivalent), scan existing `columnSegments` for any column whose last segment's `endRow` is fully terminated (`endRow < currentRow`). If found, reuse that column instead of appending. Update the column's segment list with a new segment starting at `currentRow`. Only append a new column if no recyclable column exists.

2. **Octopus merge `isBranchOut` fix**: The current `isBranchOut` check only inspects `parent_hashes[0]` (the first parent). In an octopus merge (merge commit with >2 parents), parent indices 1+ are also branch-in points. Fix the detection to check all parent indices: a commit is a branch-out for parent `i` if the child commit's SHA matches the parent commit's children list entry at index `i`.

## Acceptance criteria

- [ ] Lanes are recycled: a new branch appearing after a previous branch terminated uses the earlier column
- [ ] Column count does not grow linearly with every short-lived branch
- [ ] Octopus merge commits (3+ parents) have all parent lanes correctly identified and drawn
- [ ] All existing lane assignment tests pass (`src/panels/git/laneAssignment.test.ts`)
- [ ] New test: lane recycling after short-lived branch (commits 1→2, 1→3→4, 2 merges to 4, new branch 5 diverges from 4 — lane 2 should be reused for 5)
- [ ] New test: octopus merge with 3 parents all correctly detected
- [ ] `npx tsc --noEmit` passes

## Blocked by

None — can start immediately. Issue 001 is independent of this.
