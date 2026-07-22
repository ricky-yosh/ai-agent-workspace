# Commit Quick-Open modal (Cmd+Shift+O)

Labels: `ready-for-agent`

## Parent

`.scratch/git-tree-improvements/PRD.md`

## What to build

Add a `Cmd+Shift+O` commit quick-open modal in the Git Graph Panel. Create `src/panels/git/CommitQuickOpenModal.tsx`:

1. **Modal component** — centered overlay with a text input and results list:
   - Placeholder: "Search by commit SHA, branch, or tag..."
   - Input captures keystrokes for live-filtering
   - Results shown as a flat list below the input
   - Each result item shows: colored commit dot (from branch color), short hash (monospace), first line of commit message; or branch/tag icon + name + short hash
   - Results sorted: exact SHA matches first, branch/tag matches second, partial SHA matches third
   - Debounce 150ms before filtering to avoid jank

2. **Matching logic** — pure function `matchCommit(query, commits)` returns matching `CommitInfo[]`:
   - Exact SHA match (full hash or 7-char short hash): single result
   - Branch name match (from `refs` field): filter commits whose refs include the query
   - Partial SHA match: filter commits whose hash starts with the query
   - For branch/tag matches, deduplicate by commit hash (one result per unique commit)

3. **Integration with GitTreePanel**:
   - `useEffect` listening for `Cmd+Shift+O` keydown on the scroll container
   - Opens modal, focuses input
   - On Enter: navigates to and selects the first result, closes modal, scrolls virtualizer to the selected row
   - On Escape: closes modal without navigating
   - On click-outside: closes modal

4. **Navigation**: When a match is selected via Enter, set `selectedIndex` to the matched row index, set `selectedSha`, scroll `virtualizer.scrollToIndex(index, { align: 'center' })`. Do not open the detail pane or dispatch a diff — the modal is navigation-only.

## Acceptance criteria

- [ ] `Cmd+Shift+O` opens the quick-open modal when the Git Graph Panel is focused
- [ ] Typing a partial SHA filters to matching commits live
- [ ] Typing a branch name matches commits on that branch
- [ ] Typing a tag name matches the tagged commit
- [ ] Enter navigates to the first match and closes the modal
- [ ] Escape closes the modal without navigating
- [ ] `npx tsc --noEmit` passes

## Blocked by

None — can start immediately. Independent of other issues.
