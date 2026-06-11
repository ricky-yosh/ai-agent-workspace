# Implement pure Session resolution function for standalone MCP server

Status: ready-for-agent

## Parent

Implements ADR 0011 (`.aw/adr/0011-mcp-standalone-session-resolution-fallback.md`) and PRD `.aw/progress/2026-06-09-mcp-session-resolution/PRD.md`.

## What to build

A pure resolution function for the standalone `aiaw-mcp-server`:

```
resolve_session_id(env_session_id: Option<&str>, cwd: &Path, registry: &SessionRegistry) -> Result<String, SessionResolutionError>
```

Priority order:
1. If `env_session_id` is `Some`, return it immediately — no registry lookup.
2. Otherwise, match `cwd` (after canonicalization) against each Session's `working_directory`:
   - Exactly one match → return that Session's ID.
   - Zero matches → return a "no match" error including the searched directory.
   - Multiple matches → return a "multiple matches" error including all candidate Session IDs and names.

This function takes no I/O dependencies beyond its arguments — it must be testable purely in-memory with fixture `SessionRegistry` data and fake `cwd` values.

## Acceptance criteria

- [ ] `resolve_session_id` exists with the signature above (or equivalent) and a `SessionResolutionError` enum with "no match" and "multiple matches" variants
- [ ] When `env_session_id = Some(...)`, it is returned regardless of registry contents (including an empty registry)
- [ ] When `env_session_id = None` and exactly one Session's `working_directory` matches `cwd`, that Session's ID is returned
- [ ] When `env_session_id = None` and zero Sessions match, a "no match" error is returned including the searched `cwd`
- [ ] When `env_session_id = None` and multiple Sessions match, a "multiple matches" error is returned listing all candidate Session IDs and names
- [ ] Unit tests cover all of the above using fixture `SessionRegistry` data, with no filesystem or process dependencies

## Blocked by

None - can start immediately
