Status: ready-for-agent

# 03: Git History & Ownership MCP Tools

## What to build

MCP tools that give the AI access to git history and file ownership signals. These are thin wrappers around git operations — no tree-sitter or indexing needed. The tools let the AI understand what changed, when, why, and who maintains what.

Tools: `search_history` (commit search, diff queries), `blame` (per-line ownership), and `get_owners` (CODEOWNERS parsing).

## Acceptance criteria

- [ ] MCP tools registered in `tool_box!`:
  - `search_history` — search commit messages and diffs by keyword, author, date range; returns commit summaries
  - `blame` — run git blame on a file; returns per-line author and commit info
  - `get_owners` — parse CODEOWNERS file (if present) for a given path; returns owner list
- [ ] Tools operate on the session's working directory repo
- [ ] Tools handle missing git repo gracefully (clear error message)
- [ ] Tools handle missing CODEOWNERS file gracefully (returns empty list, not error)
- [ ] `search_history` supports: keyword filter, author filter, date range (after/before), max results limit
- [ ] `blame` returns: line number, author, commit hash, date for each line
- [ ] Integration test: `search_history` against a test repo with known commits
- [ ] Integration test: `blame` against a test repo with known authors

## Blocked by

None — can start immediately.
