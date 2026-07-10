# Lane assignment algorithm + branch colors

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/PRD.md` — Git tree panel DAG graph

## What to build

Two pure TypeScript modules, testable in isolation with no React or DOM dependencies.

**Lane assignment algorithm** (`src/panels/git/laneAssignment.ts`):

Port the greedy column (lane) assignment algorithm from CommitGraph's `computePosition.ts`. Input is commits sorted in topological order (children before parents; within same level, by date newest first).

For each commit:
- If it has no children (last on its branch), assign to a new column
- If it has children and is the first parent of at least one child ("branch out"), assign to the leftmost child's column. Trim other child columns to end one row above this commit
- Otherwise (merge): find the rightmost child's column, then find the first column to the right whose last segment ended before the topmost child's row. If none found, create a new column

Interface: `computeLanes(commits: CommitTopology[]): CommitPosition[]`
- `CommitTopology = { sha: string; parent_hashes: string[] }`
- `CommitPosition = { sha: string; column: number; row: number }`

**Branch color palette** (`src/panels/git/branchColors.ts`):

Given a branch identity (SHA of the branch's first commit), returns a CSS variable string for one of 8-10 theme-compatible colors. Deterministic — the same SHA always maps to the same color.

Interface: `getBranchColor(branchFirstSha: string): string`

**Tests** (`src/panels/git/laneAssignment.test.ts`):

6+ test cases covering:
1. Linear history (each commit has one parent, all in one lane)
2. Single branch fork (two branches diverging from one commit)
3. Octopus merge (3+ parents merging into one child)
4. Cross-branch merge (merging from a branch that is visually to the right)
5. Branch collapse (branch ends, its lane is reclaimed by a later merge)
6. Fast-forward chain (sequence of single-parent commits on one branch)

## Acceptance criteria

- [ ] `computeLanes` returns correct column/row assignments for all 6 test cases
- [ ] `getBranchColor` returns a valid CSS variable string for any SHA input
- [ ] Same SHA always returns same color (deterministic)
- [ ] No React, no DOM, no file I/O — pure functions only
- [ ] All tests pass: `npx vitest run src/panels/git/laneAssignment`

## Blocked by

None - can start immediately (buildable with mock data)
