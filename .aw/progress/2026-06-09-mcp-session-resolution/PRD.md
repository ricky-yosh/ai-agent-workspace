# PRD: Standalone MCP Session Resolution Fallback

## Problem Statement

The standalone `aiaw-mcp-server` binary attributes Workspace tool calls (`workspace_list`, `workspace_add`, etc.) to a Session via the `AIAW_SESSION_ID` environment variable. This variable is only present when an AI tool is launched from inside an AIAW Terminal Panel, which injects it into the PTY's shell.

When a user connects an AI tool to `aiaw-mcp-server` from a context AIAW never spawned — Cursor's integrated terminal, a regular shell with `claude mcp add aiaws -- aiaw-mcp-server` configured globally, etc. — `AIAW_SESSION_ID` is absent. Every Workspace tool call currently fails with "AIAW_SESSION_ID environment variable is not set," even though the user is sitting in a directory that corresponds to exactly one Session.

## Solution

When `aiaw-mcp-server` starts without `AIAW_SESSION_ID`, it resolves the target Session by matching its own process `cwd` against each Session's `working_directory` in `sessions.json`:

- Exactly one match → that Session is used for the rest of the process's lifetime, transparently.
- Zero matches → the process exits at startup with an error explaining that no Session was found for this directory, suggesting the user create one (`aiaws session create`) or set `AIAW_SESSION_ID`.
- Multiple matches → the process exits at startup with an error listing the candidate Session IDs/names and instructing the user to set `AIAW_SESSION_ID` to disambiguate.

Resolution happens once at startup, before any tools are served, so failures are fail-fast and actionable rather than surfacing deep inside a tool call. `AIAW_SESSION_ID`, when present, continues to take priority unchanged (ADR 0009 behavior for AIAW-spawned terminals). This is standalone-mode-only: embedded mode (in-process with the GUI) and the `aiaws` CLI (explicit Session arguments) are unaffected. See ADR 0011.

## User Stories

1. As a developer using Cursor with `aiaw-mcp-server` configured as a global MCP server, I want Workspace tools to work when my terminal's cwd matches an AIAW Session's working directory, so that I don't have to manually configure `AIAW_SESSION_ID`.
2. As a developer running `claude` in my normal shell (not an AIAW Terminal Panel) inside a directory with one AIAW Session, I want `workspace_list`, `workspace_add`, etc. to operate on that Session automatically.
3. As a developer in a directory with no AIAW Session at all, I want a clear startup error telling me no Session was found and how to create one or set `AIAW_SESSION_ID`, rather than a confusing failure on the first tool call.
4. As a developer in a directory with two or more AIAW Sessions (same `working_directory`), I want a startup error listing the candidate Session IDs/names so I know exactly which value to put in `AIAW_SESSION_ID`.
5. As a developer using AIAW's Terminal Panel as before, I want `AIAW_SESSION_ID` to continue working exactly as it does today — the new resolution logic must not change behavior when the env var is set.
6. As a developer using the embedded MCP server (in-process with the GUI), I want my experience to be unchanged — this resolution logic does not apply to embedded mode.
7. As a developer using the `aiaws` CLI directly, I want my experience to be unchanged — the CLI continues to take explicit Session arguments and does not use this resolution logic.
8. As a maintainer, I want the resolution algorithm to be a pure, isolated function so it can be unit-tested against fixture `SessionRegistry` data and fake `cwd` values without spawning real processes or touching the filesystem.

## Implementation Decisions

- New `session_resolution` module in `crates/mcp-server`, containing a single pure function:
  - `resolve_session_id(env_session_id: Option<&str>, cwd: &Path, registry: &SessionRegistry) -> Result<String, SessionResolutionError>`
  - Priority order: (1) `env_session_id` if `Some`, returned as-is, no validation against the registry; (2) match `cwd` against `Session.working_directory` for each Session in `registry.list()`.
- `SessionResolutionError` enum with variants for "no match" and "multiple matches", each carrying enough data (candidate Session IDs/names, the `cwd` searched) to render an actionable error message via `Display`.
- `crates/mcp-server/src/main.rs` changes:
  - Before constructing `McpHandler`, call `resolve_session_id(std::env::var("AIAW_SESSION_ID").ok().as_deref(), &std::env::current_dir()?, &sessions.lock().unwrap())`.
  - On `Err`, print the error's `Display` message to stderr and `std::process::exit(1)` — no tools are served.
  - On `Ok(session_id)`, pass the resolved ID into `McpHandler` via a new field.
- `McpHandler` (`crates/mcp/src/lib.rs`) gains a field, e.g. `resolved_session_id: Option<String>`. `require_session_id()` becomes an instance method:
  - If `self.resolved_session_id` is `Some(id)`, return it.
  - Else, fall back to the current `std::env::var("AIAW_SESSION_ID")` behavior (preserves embedded-mode behavior exactly — embedded mode constructs `McpHandler` with `resolved_session_id: None`).
- `cwd`-to-`working_directory` matching is an exact string/path comparison (after canonicalization) — no prefix or ancestor-directory matching in this PRD.
- `working_directory` matching only considers Sessions regardless of `state` (running/paused/missing) — a paused Session in the right directory is still a valid match. (Open question flagged below if this needs revisiting.)

## Testing Decisions

- Good tests here exercise `resolve_session_id` purely through its inputs/outputs — construct an in-memory `SessionRegistry` (or equivalent fixture) with known Sessions and `working_directory` values, pass various `(env_session_id, cwd)` combinations, and assert on the `Result` and error variant/contents. No filesystem, process spawning, or MCP transport involved.
- Cases to cover:
  - `env_session_id = Some(...)` → returned immediately regardless of registry contents (including empty registry).
  - `env_session_id = None`, exactly one Session matches `cwd` → that Session's ID returned.
  - `env_session_id = None`, zero Sessions match `cwd` → `SessionResolutionError` "no match" variant, with `cwd` included in the error data.
  - `env_session_id = None`, multiple Sessions match `cwd` → `SessionResolutionError` "multiple matches" variant, with all candidate IDs/names included.
  - Path canonicalization edge cases (trailing slash, symlinks if practical to fixture).
- `crates/mcp-server/tests/integration_test.rs` already exists — add a startup-level test (or extend it) confirming the binary exits non-zero with the expected stderr message when no `AIAW_SESSION_ID` is set and no Session matches `cwd`, using a temporary `sessions.json` fixture.
- `McpHandler`'s `require_session_id()` fallback behavior (resolved field vs. env var) is simple enough to cover with a couple of unit tests in `crates/mcp` confirming both branches.

## Out of Scope

- Any change to embedded-mode session orientation — embedded mode continues to use `AppState` directly and is untouched.
- Any change to the `aiaws` CLI's session argument handling.
- Prefix/ancestor-directory matching (e.g. resolving from a subdirectory of a Session's `working_directory`) — only exact matches are considered.
- Any "implicit current/focused session" mechanism — explicitly rejected per ADR 0011.
- Live re-resolution if `sessions.json` changes after the standalone process starts — resolution is a one-time startup step.
- Tooling/UX for the `AIAW_SESSION_ID` disambiguation step itself (e.g. an interactive picker) — the error message simply lists candidates for the user to act on manually.

## Further Notes

- This PRD implements ADR 0011 (`.aw/adr/0011-mcp-standalone-session-resolution-fallback.md`), which also updated `.aw/CONTEXT.md`'s "Standalone MCP session resolution fallback" decision.
- Open question for a future iteration: should `working_directory` matching exclude `missing` Sessions (unreachable directories)? Since the match is on `cwd` of a running process, a `missing` Session with that `working_directory` would be unusual but not impossible (e.g. directory was deleted and recreated). Left as exact-match-on-all-states for simplicity; revisit if it causes confusion in practice.
