# ADR 0009: Session Orientation for MCP via Environment Variable Injection

## Status

Accepted

## Context

The Workspace MCP server will eventually expose Commands (e.g. `CreateTask`) that are scoped to a particular Session. These Commands are issued by an AI agent harness (Claude Code, Codex, etc.) that the user launches manually inside a Session's Terminal Panel PTY. The agent process — and the stdio MCP server it spawns — has no inherent way to know which Session it is running inside, since it's just a shell process with a working directory.

Each Terminal Panel's PTY is scoped to exactly one Session and never shared across Sessions (confirmed user decision). This constraint makes a lightweight solution possible: we don't need the MCP to resolve Session identity dynamically from shared/ambiguous state.

Alternatives considered:
- Resolve Session identity by matching the agent's `cwd` against `workingDirectory` entries in the Session Registry. Rejected: ambiguous when multiple Sessions share a `workingDirectory`, and requires the MCP to read and parse the registry on every call.
- Require the agent to pass an explicit `session_id` argument to every Command. Rejected: pushes orientation burden onto the user/agent, who has no natural way to discover the ID, defeating the "every user action has a command equivalent" principle.
- Run the MCP as a long-lived shared process across all Sessions. Rejected: incompatible with the per-Session PTY scoping decision and reintroduces the ambiguity problem.

## Decision

When the app spawns a Terminal Panel's PTY for a Session, it injects an `AIAW_SESSION_ID` environment variable (the Session's UUID) into that shell's environment. Any stdio-based MCP server launched as a child process from within that shell inherits the variable via standard process environment inheritance and reads it directly to attribute Commands to the correct Session.

## Consequences

- Session attribution is automatic and unambiguous — no registry lookups, no explicit arguments, no agent-side discovery step.
- Works transparently regardless of the agent's `cwd` within the working directory.
- Depends on the MCP server being launched as a child process of the Session's terminal shell (stdio transport, per-project config) — a long-lived MCP process shared across Sessions would not receive the variable and would need a different mechanism. This is acceptable given the per-Session PTY scoping decision.
