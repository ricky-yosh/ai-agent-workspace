# Wire resolved Session ID into Workspace tools, preserving embedded-mode behavior

Status: ready-for-agent

## Parent

Implements ADR 0011 (`.aw/adr/0011-mcp-standalone-session-resolution-fallback.md`) and PRD `.aw/progress/2026-06-09-mcp-session-resolution/PRD.md`.

## What to build

`McpHandler`'s `require_session_id()` currently reads `AIAW_SESSION_ID` directly from the environment as a static check. Change it to an instance method that:

1. Returns the Session ID resolved at startup (issue 02), if present.
2. Otherwise, falls back to the existing `std::env::var("AIAW_SESSION_ID")` check, unchanged — this is the embedded-mode path, where `McpHandler` is constructed without a resolved Session ID.

This keeps standalone mode using the fail-fast-resolved value, while embedded mode (in-process with the GUI, no resolution step) behaves exactly as it does today.

## Acceptance criteria

- [ ] `McpHandler` exposes the resolved Session ID from issue 02 to its Workspace tools (`workspace_list`, `workspace_add`, etc.)
- [ ] When a resolved Session ID is present (standalone mode), Workspace tools use it without consulting `AIAW_SESSION_ID`
- [ ] When no resolved Session ID is present (embedded mode), Workspace tools fall back to the current `AIAW_SESSION_ID` environment variable check, with identical error behavior to before this change
- [ ] Unit tests cover both branches (resolved value present vs. absent)
- [ ] Existing embedded-mode tests continue to pass unchanged

## Blocked by

- `.scratch/mcp-session-resolution/issues/02-startup-resolution-and-fail-fast-errors.md`
