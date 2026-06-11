# End-to-end startup tests for standalone server resolution

Status: ready-for-agent

## Parent

Implements ADR 0011 (`.aw/adr/0011-mcp-standalone-session-resolution-fallback.md`) and PRD `.aw/progress/2026-06-09-mcp-session-resolution/PRD.md`.

## What to build

Add integration-level tests for the standalone `aiaw-mcp-server` covering the full startup-resolution flow from issues 01-03, using a fixture `sessions.json` and no `AIAW_SESSION_ID` set:

- **Single match**: `cwd` matches exactly one fixture Session's `working_directory` → server starts successfully and a Workspace tool call is correctly attributed to that Session.
- **Zero matches**: `cwd` matches no fixture Session → process exits non-zero with the expected stderr message.
- **Multiple matches**: `cwd` matches more than one fixture Session → process exits non-zero with an stderr message listing all candidates.

Extend the existing `crates/mcp-server/tests/integration_test.rs` rather than creating a new test harness if it already supports spawning the binary with a controlled `cwd` and fixture state directory.

## Acceptance criteria

- [ ] An integration test confirms successful startup and correct Session attribution when `cwd` matches exactly one fixture Session, with no `AIAW_SESSION_ID` set
- [ ] An integration test confirms a non-zero exit and the expected "no match" stderr message when `cwd` matches zero fixture Sessions
- [ ] An integration test confirms a non-zero exit and an stderr message listing all candidates when `cwd` matches multiple fixture Sessions
- [ ] All new and existing tests in the standalone server's test suite pass

## Blocked by

- `.scratch/mcp-session-resolution/issues/03-workspace-tools-use-resolved-session.md`
