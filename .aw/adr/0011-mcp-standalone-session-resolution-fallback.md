# ADR 0011: Standalone MCP Session Resolution Fallback

## Status

Accepted (amends ADR 0009)

## Context

ADR 0009 establishes `AIAW_SESSION_ID` as the mechanism by which the standalone `aiaw-mcp-server` binary determines which Session a tool call should operate on. This works when the AI tool is launched from inside an AIAW Terminal Panel, which injects the env var into the shell.

However, AI tools are commonly connected to MCP servers from contexts AIAW never spawned — e.g., Cursor's own integrated terminal, or a user's regular shell with `claude mcp add aiaws -- aiaw-mcp-server` configured globally. In these cases `AIAW_SESSION_ID` is absent, and the standalone binary has no way to attribute Commands to a Session.

We considered an "implicit current/focused session" model, where the MCP server operates on whichever Session is currently open/focused in the GUI. This was rejected: it requires new global mutable state shared across processes, breaks down with multiple GUI windows, multiple Sessions per `workingDirectory`, or no GUI running at all, and risks silently misattributing writes to the wrong Session. It also diverges from precedent in comparable GUI-app MCP integrations (JetBrains MCP uses explicit `projectPath` plus instance-binding env vars; Blender/Unity MCP's implicit single-instance model explicitly disclaims multi-window/multi-agent support).

## Decision

When `aiaw-mcp-server` (standalone mode only) starts without `AIAW_SESSION_ID`, it resolves the target Session by matching its process `cwd` against `Session.workingDirectory` in `sessions.json`:

1. `AIAW_SESSION_ID` env var set → use it (unchanged from ADR 0009).
2. Else, match `cwd` against `Session.workingDirectory`:
   - Exactly one match → use it.
   - Zero matches → error: no Session found for this directory; suggests creating one or setting `AIAW_SESSION_ID`.
   - Multiple matches → error listing candidate Session IDs/names, instructing the user to set `AIAW_SESSION_ID` to disambiguate.

Resolution happens once at process startup, before any tools are served — failing fast with a clear, actionable error rather than guessing.

This applies only to the standalone `aiaw-mcp-server` binary. Embedded mode has direct access to the active Session via `AppState` and performs no resolution.

## Consequences

- External tools (Cursor, a bare `claude` in the user's normal shell) work out of the box when their `cwd` is a Session's `workingDirectory`, with zero configuration.
- Multiple Sessions per `workingDirectory` require the user to set `AIAW_SESSION_ID` manually — a known, documented edge case rather than a silent misattribution.
- No new shared mutable "current session" state is introduced; resolution is derived purely from `sessions.json` + process `cwd`, both already canonical.
- Startup may now fail (with a helpful error) where it previously would have failed later, deeper in the first tool call — this is a UX improvement (fail fast, actionable message).
