# Contiguous selection and range diff dispatch

Labels: `ready-for-agent`

## Parent

`.scratch/git-tree-improvements/PRD.md`

## What to build

Add contiguous commit selection (shift-click) and range diff dispatch to the Diff Viewer Panel. Changes:

### Frontend (`src/panels/GitTreePanel.tsx`):

1. **Selection state** — replace `selectedIndex` with range selection:
   - `selectionAnchor: number | null` — the first-clicked commit row index
   - `selectionRange: [number, number] | null` — `[startRow, endRow]` representing the selected commit span
   - Single click: sets `selectionAnchor = rowIndex` and `selectionRange = [rowIndex, rowIndex]`
   - Shift+click: extends `selectionRange` from `selectionAnchor` to `clickedRow` (min/max determines start/end)
   - Shift+ArrowUp/ArrowDown: extends range by ±1 row (keeps or sets anchor on first arrow key with shift)
   - Escape: clears both anchor and range

2. **Row highlighting** — rows in `[rangeStart, rangeEnd]` get the accent-tinted background. The anchor row gets a slightly stronger highlight or a distinct border to indicate which end of the range is the "start."

3. **Range diff dispatch** — when a multi-commit range is selected and the user opens the diff (Enter or a toolbar action), compute `oldestSha` and `newestSha` from the range endpoints and call `safeInvoke<string>("get_range_diff", { sessionId, oldestSha, newestSha })`. Dispatch the result via `registry.dispatchDiffContent(diffContent, "${oldest.slice(0,7)}..${newest.slice(0,7)}")`.

### Backend (`crates/git-operations/src/lib.rs`):

4. **New Tauri command** `get_range_diff`:
   - Signature: `(session_id: String, oldest_sha: String, newest_sha: String) -> Result<String, String>`
   - Runs `git diff <oldest_sha>^..<newest_sha> --stat -p`
   - The `^` parent suffix on `oldest_sha` ensures the diff includes changes from the oldest commit (without it, the range excludes the first commit's changes)
   - Single-commit selection (oldest_sha === newest_sha) should fall back to `git show <sha>` behavior

5. **Register** `get_range_diff` in the Tauri `invoke_handler`.

### Detail Pane behavior:

6. When a multi-commit range is selected, the Commit Detail Pane shows summary info for the range: number of commits in range, oldest and newest SHAs, and a message like "Showing range: abc1234..def5678 (3 commits)".

## Acceptance criteria

- [ ] Clicking a commit selects it as a single-commit range
- [ ] Shift+click extends the selection to a contiguous range
- [ ] All rows in the range are highlighted
- [ ] Range diff opens in the Diff Viewer with correct title (e.g., "abc1234..def5678")
- [ ] Range diff content matches `git diff oldest^..newest` output
- [ ] Single-commit selection still dispatches a diff (backward compatible)
- [ ] Escape clears the selection
- [ ] `npx tsc --noEmit` passes
- [ ] `cargo build` passes in `src-tauri`

## Blocked by

None — can start immediately. Independent of other issues.
