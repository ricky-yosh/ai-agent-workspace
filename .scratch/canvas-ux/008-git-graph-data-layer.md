# Git graph data layer

Labels: `ready-for-agent`

## Parent

`.scratch/canvas-ux/PRD.md` — Git tree panel DAG graph

## What to build

Add the three backend Tauri commands needed to power the git graph panel, and extend the `CommitInfo` struct to carry parent hashes and ref decorations.

**Extend `CommitInfo`** in `crates/git-operations/src/lib.rs`:
- Add `parent_hashes: Vec<String>` — the SHA list from git log's `%P` format
- Add `refs: Vec<String>` — branch, tag, and remote ref names pointing to this commit, parsed from git log's `%D` format (e.g. `HEAD -> main, origin/main, tag: v1.0`)

**`get_graph_topology`** Tauri command:
- Signature: `(session_id: String, max_count?: u32) -> Result<Vec<CommitInfo>, String>`
- Resolves working directory from session
- Runs `git log --all --topo-order --format="%H|%P|%D" --max-count=<n>` (default 500)
- Parses output: first field is SHA, second is space-separated parent hashes (empty for initial commit), third is comma-separated ref decorations
- Returns `Vec<CommitInfo>` with `hash`, `parent_hashes`, and `refs` populated; all other fields empty

**`get_commit_details`** Tauri command:
- Signature: `(session_id: String, shas: Vec<String>) -> Result<Vec<CommitInfo>, String>`
- Resolves working directory from session
- Feeds each SHA to `git cat-file --batch` via stdin
- Parses output: author, author email, date, and message
- Returns `Vec<CommitInfo>` with author/date/message populated; parent_hashes and refs may be empty

**`get_diff_tree`** Tauri command:
- Signature: `(session_id: String, hash: String) -> Result<String, String>`
- Resolves working directory from session
- Runs `git diff-tree --stat <hash>` to get the files-changed summary
- Returns the raw output as a string (frontend formats it)

Register all three commands in the `invoke_handler` macro alongside existing commands.

## Acceptance criteria

- [ ] `get_graph_topology` returns correct topology for a git repo (SHAs, parent relationships, ref decorations)
- [ ] `get_commit_details` returns author, date, and message for a batch of SHAs
- [ ] `get_diff_tree` returns the files-changed stat output for a commit
- [ ] Empty parent list for initial commit (no crash)
- [ ] Empty refs list for commits without branch/tag decorations
- [ ] Error handling: not a git repo, invalid SHAs, empty SHA list
- [ ] `cargo build` passes in `src-tauri`

## Blocked by

None - can start immediately
