# Wire startup resolution and fail-fast errors into standalone MCP server

Status: ready-for-agent

## Parent

Implements ADR 0011 (`.aw/adr/0011-mcp-standalone-session-resolution-fallback.md`) and PRD `.aw/progress/2026-06-09-mcp-session-resolution/PRD.md`.

## What to build

Wire `aiaw-mcp-server`'s startup sequence to call the resolution function from issue 01 once, before serving any tools:

- Read `AIAW_SESSION_ID` (if set) and the process's current working directory.
- Call `resolve_session_id(env_session_id, cwd, &registry)`.
- On `Ok(session_id)`, hold onto the resolved Session ID for the lifetime of the process (to be consumed by issue 03).
- On `Err`:
  - "no match" → print a message to stderr explaining no Session was found for this directory, and that the user should create one (`aiaws session create`) or set `AIAW_SESSION_ID`. Exit non-zero. No tools are served.
  - "multiple matches" → print a message to stderr listing the candidate Session IDs/names and instructing the user to set `AIAW_SESSION_ID` to disambiguate. Exit non-zero. No tools are served.

When `AIAW_SESSION_ID` is set, this resolution step must be a no-op pass-through — startup behavior is unchanged from before this issue.

## Acceptance criteria

- [ ] On startup, the standalone MCP server resolves its Session via the function from issue 01 before serving any tools
- [ ] If resolution succeeds, the resolved Session ID is held for the process lifetime (available to be wired into tools in issue 03)
- [ ] "No match" resolution causes a non-zero exit with an actionable stderr message (mentions creating a Session or setting `AIAW_SESSION_ID`)
- [ ] "Multiple matches" resolution causes a non-zero exit with an stderr message listing all candidate Session IDs/names and mentioning `AIAW_SESSION_ID`
- [ ] When `AIAW_SESSION_ID` is set, startup succeeds exactly as it did before this change, regardless of registry contents

## Blocked by

- `.scratch/mcp-session-resolution/issues/01-pure-session-resolution-function.md`
