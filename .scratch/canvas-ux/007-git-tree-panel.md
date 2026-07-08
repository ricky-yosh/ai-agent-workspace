# Git tree panel

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/map.md` — Canvas UX

## What to build

New panel type that shows commit history as a hierarchical tree (grouped by author, date, or branch). Each entry shows commit message, author, relative date, and abbreviated hash. Clicking a single commit opens its diff in the diff viewer. Clicking a commit range (two selected commits, or a branch tip vs merge-base) opens the cumulative diff. Includes a refresh button. Uses the extracted viewer dispatch abstraction from issue 006.

Requires a new backend Tauri command (`get_commit_diff`) to fetch the diff for a specific commit hash or range — the existing `get_git_diff` only supports unstaged/staged.

## Acceptance criteria

- [ ] Git tree panel can be opened as a new panel type from the panel type selector
- [ ] Panel mounts, calls `search_history`, and displays commits in a grouped tree
- [ ] Each commit entry shows: commit message, author, relative date ("2 hours ago"), abbreviated hash (7 characters)
- [ ] Grouping can be switched between: by author, by date (day), by branch
- [ ] Clicking a single commit opens that commit's diff in the Diff Viewer Panel
- [ ] Selecting two commits (shift-click) and clicking the selection opens the cumulative diff in the Diff Viewer Panel
- [ ] Refresh button re-fetches commit history
- [ ] Empty state shows when there are no commits

## Blocked by

- `006-viewer-dispatch-extraction.md`
