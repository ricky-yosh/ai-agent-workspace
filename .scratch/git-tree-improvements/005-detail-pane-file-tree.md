# Commit Detail Pane file tree (Zed-style)

Labels: `ready-for-agent`

## Parent

`.scratch/git-tree-improvements/PRD.md`

## What to build

Replace the raw `--stat` text blob in the Commit Detail Pane with a browsable file tree, matching Zed's implementation. Changes in `src/panels/GitTreePanel.tsx`:

1. **File tree parser** — create `src/panels/git/fileTreeParser.ts` (pure function):
   - Input: raw output from `git diff-tree --numstat <hash>` (uses `--numstat` for machine-parseable numbers instead of `--stat` text)
   - Output: `FileTreeEntry[]` where each entry is `{ path: string, additions: number, deletions: number, status: "added" | "modified" | "deleted" | "renamed", children?: FileTreeEntry[] }`
   - Parse the numstat lines (`additions\td-deletions\tpath`) and insert into a directory tree structure (splitting on `/`)
   - Directory nodes have aggregated additions/deletions from all children
   - Handle renamed files (in numstat format, renamed files have the old and new paths separated by tab+null)

2. **File tree rendering** in the detail pane:
   - Tree view (default): recursive indented list with collapsible directory nodes. Each directory shows its name + aggregate (additions/deletions). Each file shows filename (bold), additions count (green), deletions count (red), and status color indicator.
   - Flat view: simple list sorted by path, with directory segments shown in muted text and filename in bold. Toggle between views with `Ctrl+T`.
   - Clicking a file dispatches its per-commit diff to the Diff Viewer Panel via the existing `registry.dispatchDiffContent()` method. To get per-file diff content, add a new Tauri command `get_file_diff(sessionId, commitHash, filePath)` that runs `git show <hash> -- <path>`.

3. **New Tauri command** `get_file_diff`:
   - Signature: `(session_id: String, hash: String, file_path: String) -> Result<String, String>`
   - Runs `git show <hash> -- <file_path>` to get the per-file diff

4. **Switch from `--stat` to `--numstat`** in the Rust `get_diff_tree` command, or add a separate `get_diff_numstat` command. The frontend needs machine-parseable addition/deletion numbers to render the file tree correctly.

## Acceptance criteria

- [ ] File tree parser correctly builds directory hierarchy from flat paths
- [ ] Tree view shows collapsible directories with aggregate additions/deletions
- [ ] Flat view shows a sorted file list with directory segments muted
- [ ] `Ctrl+T` toggles between tree and flat view
- [ ] Clicking a file dispatches its per-commit diff to the Diff Viewer Panel
- [ ] Files show correct status (added, modified, deleted) with color
- [ ] Directories show aggregate addition/deletion counts
- [ ] `npx tsc --noEmit` passes
- [ ] `cargo build` passes in `src-tauri`

## Blocked by

None — can start immediately. Independent of rendering fixes.
