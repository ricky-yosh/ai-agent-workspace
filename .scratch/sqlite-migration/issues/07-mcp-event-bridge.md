Status: ready-for-agent

# 07: MCP Event Bridge — DomainEvent to Callbacks

## Parent

PRD: Migrate Persistence from JSON to SQLite

## What to build

In `crates/mcp/src/lib.rs`, after each `execute()` call (wrapped in `tokio::task::spawn_blocking` since the executor is synchronous and the MCP runtime is async), iterate `outcome.events` and invoke the existing MCP callbacks:

- `DomainEvent::SessionsChanged` → `on_session_changed()`
- `DomainEvent::LayoutsChanged` → `on_layouts_changed()`
- `DomainEvent::WorkspaceChanged { .. }` → `on_session_changed()`

The MCP handler already holds callback references for change notifications. This slice wires `DomainEvent` to those callbacks instead of relying on file watcher triggers.

The standalone MCP server binary (`crates/mcp-server/src/main.rs`) uses the same pattern but may not need `spawn_blocking` if it runs synchronously for persistence calls.

## Acceptance criteria

- [ ] MCP handler wraps `execute()` in `spawn_blocking` for async compatibility
- [ ] `DomainEvent` variants map to existing MCP callbacks
- [ ] `SessionsChanged` triggers `on_session_changed`
- [ ] `LayoutsChanged` triggers `on_layouts_changed`
- [ ] `WorkspaceChanged` triggers `on_session_changed`
- [ ] Standalone MCP server binary compiles and works

## Blocked by

- 05-execution-outcome-domain-events
