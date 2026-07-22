# 02 — Scope out git/file tools and decouple git-operations

**What to build:** Remove the MCP tools that duplicate the host agent's own file and git capabilities, enforcing the "mutate app-owned, UI-rendered state only" scope rule. `read_file_range`, `blame`, `search_history`, and `get_owners` disappear from the advertised tool set, and the MCP crate no longer depends on `crates/git-operations`. The `git-operations` crate itself stays — the Git Graph panel still consumes it via Tauri.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `read_file_range`, `blame`, `search_history`, `get_owners` removed from the `McpHandler` tool set and its registry
- [x] The MCP crate no longer references `ai_agent_workspace_git_operations`
- [x] `crates/git-operations` still builds and the Git Graph panel path is untouched
- [x] A test asserts the four tools are absent from the advertised tool set
- [x] C4 authoring is unaffected (agent reads code with its own tools before writing `diagram_json`)
