# Git tree panel: Interactivity and detail pane

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/PRD.md` — Git tree panel DAG graph

## What to build

Add keyboard navigation, search, diff dispatch, and the Commit Detail Pane to the git tree panel.

**Keyboard navigation:**
- Arrow up/down: move selection highlight through commit rows
- Enter: open the selected commit's diff in the Diff Viewer Panel
- Escape: clear selection
- Focus trapped within the panel when active

**Commit dispatch to diff viewer:**
- Clicking a commit calls `get_commit_diff` with the commit hash
- Dispatch the diff content to the Diff Viewer Panel via `registry.dispatchDiffContent()` (the `viewer:open-diff-content` CustomEvent wired in issue 007)
- Simultaneously show the commit's metadata in the Commit Detail Pane

**Commit Detail Pane:**
- Bottom section of the panel, toggleable via a button or drag handle
- Shows when a commit is selected, collapses when selection is cleared
- Displays:
  - Full commit hash with a copy button (copies to clipboard)
  - Author name and email
  - Date: absolute (full timestamp) and relative ("2 hours ago")
  - Full commit message (all lines, not just first line)
  - Files changed list — fetched from `get_diff_tree <hash>`, rendered as a scrollable list of file paths with change counts
- Resizable split from the graph list above (separate from column resize — this is a vertical split between the list and the detail pane)

**Search bar:**
- Input at the top of the panel
- Filters commits in real-time by keyword (searches commit messages), author (searches author name), and date range
- Calls `search_history` backend command for server-side filtering
- Highlights matching text in the message column
- Debounced input (300ms) to avoid excessive backend calls

**Refresh button:**
- Button in the panel header that re-fetches graph topology
- Shows a brief spinning indicator while fetching

## Acceptance criteria

- [ ] Arrow keys navigate selection between commit rows
- [ ] Enter opens diff in the Diff Viewer Panel for the selected commit
- [ ] Escape clears selection
- [ ] Clicking a commit opens its diff in the Diff Viewer Panel
- [ ] Clicking a commit shows metadata in the Commit Detail Pane
- [ ] Commit Detail Pane shows: full hash (copyable), author, date (absolute + relative), full message, files changed list
- [ ] Commit Detail Pane is toggleable and resizable
- [ ] Search bar filters commits by keyword, author, and date range
- [ ] Search highlights matching text in the message column
- [ ] Refresh button re-fetches graph topology
- [ ] `npx tsc --noEmit` passes

## Blocked by

- `010-dag-rendering.md`
