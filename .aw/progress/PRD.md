# PRD: MCP Server (v1)

## Problem Statement

AI agents running inside the Terminal Panel (Claude Code, Codex, etc.) have no way to interact with the AI Agent Workspace — they cannot create sessions, list templates, add workspace instances, or modify layout trees. The app's backend is fully functional (the Command Layer exposes 18 operations and the CLI exercises them all), but there is no MCP interface for AI agents to call these same operations programmatically. Without the MCP server, the "AI agent as collaborator" vision is blocked — the agent can only observe the repository, not manipulate the workspace.

## Solution

Add a monolithic in-process MCP server as a Tauri plugin in a new `crates/mcp` crate. The MCP server exposes all 18 existing Command variants as MCP tools — one tool per Command. When the app spawns a Terminal Panel PTY, it injects `AIAW_SESSION_ID` into the shell environment, and the MCP server (launched as a child process) inherits this variable to attribute all operations to the correct Session. The MCP server shares `AppState` with the Tauri app so mutations appear instantly in the GUI.

## User Stories

1. As an AI agent running inside a Session's Terminal Panel, I want to call `session_create` via MCP stdio, so that I can create new Sessions programmatically.
2. As an AI agent, I want to call `session_list` via MCP stdio, so that I can discover what Sessions exist.
3. As an AI agent, I want to call `session_rename` via MCP stdio, so that I can rename Sessions I created.
4. As an AI agent, I want to call `session_delete` via MCP stdio, so that I can clean up Sessions.
5. As an AI agent, I want to call `session_open` via MCP stdio, so that I can open a Session and trigger its auto-initialization (default template + workspace).
6. As an AI agent, I want to call `session_close` via MCP stdio, so that I can close a Session.
7. As an AI agent, I want to call `template_list` via MCP stdio, so that I can see available Layout Templates.
8. As an AI agent, I want to call `template_save` via MCP stdio, so that I can create new Layout Templates programmatically.
9. As an AI agent, I want to call `template_delete` via MCP stdio, so that I can remove unwanted templates.
10. As an AI agent, I want to call `template_rename` via MCP stdio, so that I can rename templates.
11. As an AI agent, I want to call `workspace_list` via MCP stdio, so that I can see a Session's Workspace Instances.
12. As an AI agent, I want to call `workspace_get_active` via MCP stdio, so that I can discover which workspace is active in a Session.
13. As an AI agent, I want to call `workspace_add` via MCP stdio, so that I can add a Workspace Instance to a Session from a template.
14. As an AI agent, I want to call `workspace_remove` via MCP stdio, so that I can remove Workspace Instances.
15. As an AI agent, I want to call `workspace_rename` via MCP stdio, so that I can rename Workspace Instances.
16. As an AI agent, I want to call `workspace_set_active` via MCP stdio, so that I can switch between Workspace Instances.
17. As an AI agent, I want to call `workspace_update_tree` via MCP stdio, so that I can modify a workspace's panel layout.
18. As an AI agent, I want to call `workspace_reset` via MCP stdio, so that I can reset a workspace back to its template.
19. As a developer, I want the MCP server to share AppState with the Tauri app, so that MCP mutations appear instantly in the GUI without file watcher latency.
20. As a developer, I want the MCP server to emit Tauri events after each mutation, so that the frontend listeners refresh automatically.
21. As a developer, I want the MCP server to run in-process as a Tauri plugin, so that it has direct access to the Command Layer.
22. As a user, I want the MCP server to automatically know which Session it's serving via the `AIAW_SESSION_ID` env var, so that I never need to pass a session ID explicitly to the agent.
23. As a developer, I want the MCP tools to accept the same parameters as the Command enum variants, so that understanding one interface teaches the other.
24. As a developer, I want MCP errors to return structured JSON with error codes and messages, so that AI agents can handle failures gracefully.

## Implementation Decisions

### Crate structure

A new `crates/mcp` crate is added to the Cargo workspace. It depends on `crates/commands` (for the Command enum, `execute()`, and `AppState`) and on `rmcp` (the Rust MCP SDK). The Tauri app (`src-tauri`) depends on `crates/mcp` and registers it as a plugin.

**Root `Cargo.toml`** — add `crates/mcp` to workspace members.

**`crates/mcp/Cargo.toml`** — depends on `rmcp` (with `macros` feature), `ai-agent-workspace-commands`, `ai-agent-workspace-core`, `tauri`, `tokio`, `serde`, `serde_json`.

### `crates/mcp/src/lib.rs` — Tauri plugin

Exports an `init()` function returning `TauriPlugin<R>` built with `plugin::Builder::new("mcp")`. In the `setup()` hook:

1. Get `AppState` from `app.state::<AppState>()` and clone the `Arc<Mutex<SessionRegistry>>`, `Arc<Mutex<LayoutStore>>`, and `AppHandle` (via `app.handle().clone()`).
2. Build an `McpHandler` struct holding these three Arcs.
3. `tokio::spawn` (on Tauri's built-in async runtime) an async task that calls `serve_server(handler, stdio()).await` to start listening for MCP requests on stdin/stdout.
4. No TCP transport for v1.

### `crates/mcp/src/tools.rs` — Tool handlers (McpHandler struct)

A single `McpHandler` struct annotated with `#[tool_handler]` from `rmcp`. The struct holds cloned `Arc`s for `SessionRegistry`, `LayoutStore`, and `AppHandle`.

Each tool is an async method with the `#[tool]` attribute:

```rust
#[derive(Clone, tool_handler::ToolHandler)]
struct McpHandler {
    sessions: Arc<Mutex<SessionRegistry>>,
    layouts: Arc<Mutex<LayoutStore>>,
    app_handle: AppHandle,
}

impl McpHandler {
    #[tool]
    async fn session_list(&self) -> Result<Vec<SessionSummary>, McpError> {
        // Lock sessions, call execute(SessionList), map result/error
    }
    // ... 17 more tools
}
```

Each tool method:
1. Reads `AIAW_SESSION_ID` from `std::env::var()` to determine the current Session.
2. Constructs a `Command` variant with the tool's arguments.
3. Locks the appropriate Mutex, calls `execute(command, &mut state)`.
4. Maps `CommandResult` to the tool's return type.
5. Maps `CommandError` to an MCP error response.

The 18 tools (following CLI naming convention):

| Tool name | Command variant | Parameters |
|---|---|---|
| `session_create` | `SessionCreate` | `working_dir` (absolute path), `name` |
| `session_list` | `SessionList` | none |
| `session_rename` | `SessionRename` | `session_id`, `new_name` |
| `session_delete` | `SessionDelete` | `session_id` |
| `session_open` | `SessionOpen` | `session_id` |
| `session_close` | `SessionClose` | `session_id` |
| `template_list` | `TemplateList` | none |
| `template_save` | `TemplateSave` | `name`, `tree` |
| `template_delete` | `TemplateDelete` | `layout_id` |
| `template_rename` | `TemplateRename` | `layout_id`, `new_name` |
| `workspace_list` | `WorkspaceList` | `session_id` |
| `workspace_get_active` | `WorkspaceGetActive` | `session_id` |
| `workspace_add` | `WorkspaceAdd` | `session_id`, `template_id` |
| `workspace_remove` | `WorkspaceRemove` | `session_id`, `workspace_id` |
| `workspace_rename` | `WorkspaceRename` | `session_id`, `workspace_id`, `new_name` |
| `workspace_set_active` | `WorkspaceSetActive` | `session_id`, `workspace_id` |
| `workspace_update_tree` | `WorkspaceUpdateTree` | `session_id`, `workspace_id`, `tree` |
| `workspace_reset` | `WorkspaceReset` | `session_id`, `workspace_id` |

### Shared state pattern

`AppState` already uses `Arc<Mutex<SessionRegistry>>` and `Arc<Mutex<LayoutStore>>` (changed for the file watcher). The MCP plugin clones these `Arc`s into the background thread, so both the Tauri main thread and the MCP listener thread share the same Mutex-protected state.

### GUI event emission

After each successful `execute()` call, the tool handler emits the appropriate Tauri event via the cloned `AppHandle`:
- `sessions-changed` — after session mutations (create, rename, delete, open, close) and workspace mutations (add, remove, rename, set active, update tree, reset)
- `layouts-changed` — after template mutations (save, delete, rename)

These match the existing event names emitted by the file watcher, so no new frontend listeners are needed.

### Session orientation

The MCP server inherits `AIAW_SESSION_ID` from the PTY shell environment. Tools that require a session context always use the env var — v1 does not accept explicit `session_id` overrides from the agent. Tools that don't require session context (like `template_list`, `template_save`, `template_delete`, `template_rename`) operate globally without any session ID.

### rmcp integration

The `rmcp` crate (https://github.com/modelcontextprotocol/rust-sdk) provides:

- `#[tool]` attribute macro for declaring tool methods on a handler struct (requires `macros` feature on the dependency)
- `#[tool_handler]` derive macro that generates the `ServerHandler` trait implementation for the handler struct
- `serve_server(handler, transport).await` — async function that runs the MCP server over a transport
- `rmcp::transport::io::stdio()` — returns the stdio transport for stdio-based MCP
- `rmcp::ErrorData` trait — implement for the local error type to convert to JSON-RPC errors
- Tool method parameters must derive `Serialize + Deserialize` (and optionally `schemars::JsonSchema`)
- Tool methods must be async and return `Result<T, impl Into<rmcp::ErrorData>>`

The MCP server constructs the `McpHandler`, then `tokio::spawn(serve_server(handler, stdio()))` from the plugin's `setup()` hook.

### Error mapping

`CommandError` maps to MCP JSON-RPC error codes:

| CommandError field | JSON-RPC error | Mapping |
|---|---|---|
| `error: "not_found"` | code `-32001` | Entity not found |
| `error: "already_exists"` | code `-32002` | Duplicate entity |
| `error: "invalid_input"` | code `-32602` | Invalid params |
| Other `error` values | code `-32000` | Generic server error |

The JSON-RPC `data` field contains a structured object with `error` (the kind string), `entity`, and `id` from the `CommandError`. This gives AI agents enough context to understand and potentially recover from errors.

## Testing Decisions

### What makes a good test

Tests verify that each MCP tool correctly dispatches to the Command Layer and returns the expected result. Tests use temporary directories for isolation (same pattern as existing core and commands tests). Tests verify error cases (invalid session ID, missing template, etc.) return proper MCP error responses.

### Modules tested

- **`crates/mcp/src/tools.rs`** — Test each of the 18 tool methods on `McpHandler`. Create a fresh `AppState` with a temp directory and a Tauri `App`/`AppHandle` test instance, construct `McpHandler`, call the async tool method with known inputs, await the result, assert the returned data matches the expected core output. Test error propagation: when the underlying `execute()` returns an error, the tool method returns an `McpError` with the correct JSON-RPC code and data.
- **`crates/mcp/src/lib.rs`** — Test plugin setup: verify `init()` returns a valid `TauriPlugin`, verify state is accessible in `setup()`, verify the handler struct can be constructed.

### Prior art

The existing tests in `crates/commands/src/executor.rs` test the `execute()` function with `AppState` backed by temp directories. The MCP tool handler tests follow the same pattern — each test creates `AppState`, calls the tool function, and asserts the result.

## Out of Scope

- Whiteboard operations (create_card, create_edge, create_frame, etc.) — no corresponding Commands exist yet.
- Codebase intelligence tools (find_symbol, find_references, build_code_map) — no corresponding Commands exist yet.
- TCP transport — stdio only for v1. TCP can be added later as a config option on the plugin builder.
- Tool name prefixing (`workspace.*`, `codebase.*`) — all 18 v1 tools are workspace/session/template operations; prefixing is deferred until codebase tools are added.
- Frontend changes — the frontend already has event listeners for `sessions-changed` and `layouts-changed`; no new listeners needed.
- MCP capabilities beyond tools (resources, prompts) — v1 is tools-only.
- MCP server lifecycle management — the server starts with the app and stops when the app exits. No start/stop controls.
- Remote agent authentication — TCP is out of scope for v1.
- `AIAW_SESSION_ID` fallback logic — v1 requires the env var to be set. Future: allow explicit session_id parameter as override.

## Further Notes

- The MCP server is a pure adapter layer — it adds no new business logic. Every tool is a thin wrapper: receive MCP request → construct `Command` → call `execute()` → return `CommandResult` as MCP response.
- The `tree` parameter for `template_save` and `workspace_update_tree` accepts a `LayoutTree` JSON object directly (the same struct shape as the Command variant), not a JSON string. The MCP protocol natively deserializes JSON objects into structs.
- `session_create` is a global operation that does not use `AIAW_SESSION_ID` — the agent must supply an absolute `working_dir`. The agent is responsible for providing a valid path (typically the PTY's current working directory).
- `workspace_get_active` returns `null` (not an error) when a Session has no active workspace. This matches the Command Layer behavior where `execute()` returns `Ok(Unit(()))` in this case.
- The `suppress_watcher` flag in SessionRegistry and LayoutStore is set during `save()`, so MCP-initiated writes don't trigger redundant file watcher reloads. The Tauri event emission handles GUI updates directly.
- The MCP plugin does not use `invoke_handler()` (no `#[tauri::command]` functions exposed to the frontend). It's purely a background server started in `setup()`.
- If the Tauri app is not running, the MCP server is unavailable. This is acceptable — the MCP's purpose is to manipulate the workspace the user is viewing.
