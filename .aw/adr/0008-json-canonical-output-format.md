# ADR 0008: JSON Canonical Output Format

## Status

Accepted

## Context

The Command Layer dispatches all operations through a single `execute()` function with this signature:

```rust
fn execute(cmd: Command, state: &mut AppState) -> Result<CommandResult, CommandError>
```

Every interface — CLI, Tauri IPC, future MCP servers — calls this same function. We need a consistent output contract so consumers of every adapter receive predictable JSON shapes and can detect success vs. failure unambiguously.

## Decision

### Core types ARE the contract

No DTO layer in v1. The serde attributes on `Session`, `SessionSummary`, `WorkspaceInstance`, `Layout`, `LayoutTree`, `LayoutNode` define the canonical JSON shapes consumed by all interfaces. Adding a DTO layer later is invisible to consumers if needed.

### Success output

`CommandResult` is an executor internal. Adapters **unwrap** the variant and return the bare inner type:

- **CLI**: Serializes the inner value to JSON on stdout.
- **Tauri IPC**: Returns the inner Rust type directly (Tauri serializes via its own IPC).

```json
[{"id": "abc", "name": "My Session", "working_dir": "/repo", "state": "paused"}]
```

### Error output

The `CommandError` type wraps core errors with structured context. It serializes to JSON on stderr:

```json
{ "error": "not_found", "entity": "session", "id": "abc-123" }
```

Error variant codes are a stable enum — scripts branch on `"error"`, not string-match messages.

### Success vs. failure signaling

No outer envelope (`{ "ok": true, "data": ... }`). Consumers use exit codes:

- **Exit 0** → stdout is success JSON
- **Exit non-zero** → stderr is error JSON

This follows Unix convention — stdout pipes naturally (`aiaws session list | jq`).

## Consequences

- **No DTOs** locks core serde shapes as API contract. Field renames break consumers. Accepted for v1 given solo-developer codebase.
- **No versioning** in the JSON shapes. Adding fields is backward-compatible. Removing or renaming fields requires a migration. Accepted for v1.
- **No envelope** means consumers must check exit codes before deserializing. This is standard CLI behavior.
- **Error codes** must be added carefully — once published, scripts depend on them. Adding new codes is safe; removing or renaming codes is not.
- **All adapters share the same output contract** — a CLI script, a Tauri frontend, and an MCP client all see the same JSON shapes from `CommandResult`.
