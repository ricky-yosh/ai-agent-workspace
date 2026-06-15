Status: ready-for-agent

# 05: ExecutionOutcome + DomainEvent — Cross-Cutting Executor Return Type

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

Define `DomainEvent` enum and `ExecutionOutcome` struct in `crates/core/src/domain/events.rs`:

```rust
pub enum DomainEvent {
    SessionsChanged,
    LayoutsChanged,
    WorkspaceChanged { session_id: String },
}

pub struct ExecutionOutcome {
    pub result: CommandResult,
    pub events: Vec<DomainEvent>,
}
```

Update the executor signature from `Result<CommandResult, CommandError>` to `Result<ExecutionOutcome, CommandError>`. Every command arm wraps its return value in `ExecutionOutcome` with the appropriate events:

- Session mutating commands → `DomainEvent::SessionsChanged`
- Template mutating commands → `DomainEvent::LayoutsChanged`
- Workspace mutating commands → `DomainEvent::WorkspaceChanged { session_id }`
- Read-only commands (list, get) → empty events vec

Update all callers of `execute()` in Tauri and MCP to destructure `ExecutionOutcome`. At this stage callers can ignore events or log them — the bridge wiring comes in slices 6–7.

Write tests verifying that each command category returns the correct event variants.

## Acceptance criteria

- [ ] `DomainEvent` and `ExecutionOutcome` are defined in `crates/core`
- [ ] Executor returns `Result<ExecutionOutcome, CommandError>`
- [ ] Mutating session commands include `SessionsChanged`
- [ ] Mutating template commands include `LayoutsChanged`
- [ ] Mutating workspace commands include `WorkspaceChanged { session_id }`
- [ ] Read-only commands return empty events
- [ ] All callers of `execute()` compile and work with the new return type
- [ ] Tests verify correct event assignment per command category

## Blocked by

- 02-session-crud
- 03-workspace-crud
- 04-layout-template-crud
