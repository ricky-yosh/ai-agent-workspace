pub mod error;
pub mod session_resolution;

use std::sync::Arc;
use rmcp::{ServerHandler, tool};
#[cfg(feature = "tauri-integration")]
use rmcp::serve_server;
use rmcp::model::{CallToolResult, Content, ServerInfo, ServerCapabilities};
use ai_agent_workspace_core::database::Database;
use ai_agent_workspace_core::DomainEvent;
use ai_agent_workspace_commands::{AppState, Command, CommandResult, ExecutionOutcome, execute};
#[cfg(feature = "tauri-integration")]
use tauri::{Emitter, Manager};

fn invoke_callbacks(
    on_events: &Option<Arc<dyn Fn(&[DomainEvent]) + Send + Sync>>,
    events: &[DomainEvent],
) {
    if let Some(cb) = on_events {
        cb(events);
    }
}

enum ResponseFormat {
    Json,
    JsonOrNull,
    Deleted(String),
}

/// Fields never useful to an MCP-connected agent: session scoping and audit
/// timestamps. The Tauri/UI read path serializes the same domain structs
/// directly and keeps these fields; this trim only applies to agent-facing
/// MCP responses.
const AGENT_HIDDEN_FIELDS: [&str; 3] = ["session_id", "created_at", "updated_at"];

/// `*_json` domain fields (`metadata_json`, `node_ids_json`, `diagram_json`)
/// store JSON as an escaped string so the DB layer can treat it as opaque
/// text. Agent-facing responses re-parse them into real nested JSON under
/// the un-suffixed field name so the agent doesn't have to unescape a string.
fn unwrap_json_field_name(key: &str) -> Option<&'static str> {
    match key {
        "metadata_json" => Some("metadata"),
        "node_ids_json" => Some("node_ids"),
        "diagram_json" => Some("diagram"),
        "tags_json" => Some("tags"),
        _ => None,
    }
}

fn parse_embedded_json(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::String(s) => {
            serde_json::from_str(&s).unwrap_or(serde_json::Value::Null)
        }
        other => other,
    }
}

/// Recursively trims hidden fields and unwraps escaped-JSON fields from a
/// serialized `CommandResult`, at every depth (list responses, and nested
/// entities such as `canvas_import`'s `{nodes, edges, groups}`).
fn shape_value(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut shaped = serde_json::Map::new();
            for (key, val) in map {
                if AGENT_HIDDEN_FIELDS.contains(&key.as_str()) {
                    continue;
                }
                let shaped_val = shape_value(val);
                if let Some(new_key) = unwrap_json_field_name(&key) {
                    shaped.insert(new_key.to_string(), parse_embedded_json(shaped_val));
                } else {
                    shaped.insert(key, shaped_val);
                }
            }
            serde_json::Value::Object(shaped)
        }
        serde_json::Value::Array(items) => {
            serde_json::Value::Array(items.into_iter().map(shape_value).collect())
        }
        other => other,
    }
}

fn project_fields(value: serde_json::Value, fields: &[&str]) -> serde_json::Value {
    match value {
        serde_json::Value::Array(items) => serde_json::Value::Array(
            items.into_iter().map(|item| project_fields(item, fields)).collect(),
        ),
        serde_json::Value::Object(map) => {
            let mut projected = serde_json::Map::new();
            for field in fields {
                if let Some(v) = map.get(*field) {
                    projected.insert(field.to_string(), v.clone());
                }
            }
            serde_json::Value::Object(projected)
        }
        other => other,
    }
}

/// Shapes a `CommandResult` for an agent-facing MCP response: trims hidden
/// fields, unwraps escaped-JSON fields, and applies the list/detail
/// projections (`issue_list` summaries, `c4_diagram_list` metadata-only).
fn shape_command_result(result: &CommandResult) -> serde_json::Value {
    let raw = serde_json::to_value(result).unwrap_or(serde_json::Value::Null);
    match result {
        CommandResult::Issues(_) => {
            project_fields(raw, &["number", "title", "labels", "state"])
        }
        CommandResult::C4Diagrams(_) => {
            project_fields(shape_value(raw), &["id", "repo_path", "name"])
        }
        _ => shape_value(raw),
    }
}

fn mcp_app_state(state: &McpState) -> AppState {
    AppState {
        db: state.db.clone(),
    }
}

fn respond(
    state: &McpState,
    outcome: ExecutionOutcome,
    format: ResponseFormat,
) -> Result<CallToolResult, rmcp::Error> {
    invoke_callbacks(&state.on_events, &outcome.events);
    match format {
        ResponseFormat::Deleted(id) => Ok(CallToolResult::success(vec![
            Content::json(&serde_json::json!({ "deleted": true, "id": id }))?,
        ])),
        ResponseFormat::Json => Ok(CallToolResult::success(vec![
            Content::json(&shape_command_result(&outcome.result))?,
        ])),
        ResponseFormat::JsonOrNull => {
            if matches!(outcome.result, CommandResult::Unit(())) {
                Ok(CallToolResult::success(vec![
                    Content::json(&serde_json::Value::Null)?,
                ]))
            } else {
                Ok(CallToolResult::success(vec![
                    Content::json(&shape_command_result(&outcome.result))?,
                ]))
            }
        }
    }
}

/// A thin wrapper that pairs the Database with an optional event-sink callback,
/// so the macro can reach `on_events` through `$state.on_events`.
pub struct McpState {
    pub db: Database,
    pub on_events: Option<Arc<dyn Fn(&[DomainEvent]) + Send + Sync>>,
}

#[derive(Clone)]
pub struct McpHandler {
    pub db: Database,
    pub on_events: Option<Arc<dyn Fn(&[DomainEvent]) + Send + Sync>>,
    pub resolved_session_id: Option<String>,
    pub resolution_source: String,
}

impl ServerHandler for McpHandler {
    rmcp::tool_box!(@derive);

    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some("AI Agent Workspace MCP Server".into()),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

impl McpHandler {
    rmcp::tool_box!(McpHandler {
        issue_create,
        issue_list,
        issue_get,
        issue_update,
        issue_delete,
        issue_search,
        issue_get_next,
        issue_summarize_backlog,
        canvas_create,
        canvas_list,
        canvas_delete,
        canvas_rename,
        node_create,
        node_list,
        node_update,
        node_delete,
        node_source_add,
        node_source_list,
        node_source_remove,
        edge_create,
        edge_list,
        edge_update,
        edge_delete,
        group_create,
        group_list,
        group_update,
        group_delete,
        canvas_import,
        c4_diagram_create,
        c4_diagram_list,
        c4_diagram_get,
        c4_diagram_delete,
        c4_diagram_rename
    });

    fn require_session_id(&self) -> Result<String, rmcp::Error> {
        if let Some(ref id) = self.resolved_session_id {
            return Ok(id.clone());
        }
        if let Ok(id) = std::env::var("AIAW_SESSION_ID") {
            return Ok(id);
        }
        let cwd = std::env::current_dir()
            .map_err(|e| rmcp::Error::internal_error(format!("Cannot determine current directory: {}", e), None))?;
        let conn = self.db.connection()
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let sessions = self.db.sessions(&conn);
        crate::session_resolution::resolve_session_id_db(None, &cwd, &sessions)
            .map_err(|e| rmcp::Error::invalid_params(format!("{}", e), None))
    }

    #[tool(description = "Create an issue in the current session")]
    async fn issue_create(&self, #[tool(param)] title: String, #[tool(param)] body: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::IssueCreate { session_id, title, body, labels: None }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all issues in the current session")]
    async fn issue_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::IssueList { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Get an issue by ID or number")]
    async fn issue_get(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::IssueGet { id, session_id: Some(session_id) }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Update an issue's title, body, labels, or state. The id parameter accepts both UUID and issue number (e.g. '5')")]
    async fn issue_update(&self, #[tool(param)] id: String, #[tool(param)] title: Option<String>, #[tool(param)] body: Option<String>, #[tool(param)] labels: Option<Vec<String>>, #[tool(param)] state: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state_arg = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state_arg, execute(Command::IssueUpdate { id, session_id: Some(session_id), title, body, labels, state }, &mcp_app_state(&state_arg)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete an issue. The id parameter accepts both UUID and issue number (e.g. '5')")]
    async fn issue_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let ack_id = id.clone();
        respond(&state, execute(Command::IssueDelete { id, session_id: Some(session_id) }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Deleted(ack_id))
    }

    #[tool(description = "Search issues in the current session by state, label, and/or keyword")]
    async fn issue_search(&self, #[tool(param)] state: Option<String>, #[tool(param)] label: Option<String>, #[tool(param)] keyword: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state_arg = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state_arg, execute(Command::IssueSearch { session_id, state, label, keyword }, &mcp_app_state(&state_arg)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Get the next open issue to work on, prioritized by triage label, or null if none")]
    async fn issue_get_next(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::IssueGetNext { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::JsonOrNull)
    }

    #[tool(description = "Summarize the issue backlog: total, open, closed, and counts by label")]
    async fn issue_summarize_backlog(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::IssueSummarizeBacklog { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Create a visual canvas in the current session")]
    async fn canvas_create(&self, #[tool(param)] name: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::VisualCanvasCreate { session_id, name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all visual canvases in the current session")]
    async fn canvas_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::VisualCanvasList { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a visual canvas")]
    async fn canvas_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let ack_id = id.clone();
        respond(&state, execute(Command::VisualCanvasDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Deleted(ack_id))
    }

    #[tool(description = "Rename a visual canvas")]
    async fn canvas_rename(&self, #[tool(param)] id: String, #[tool(param)] name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::VisualCanvasRename { id, name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Create a node on a visual canvas with title, description, position, optional metadata, and optional tags")]
    async fn node_create(&self, #[tool(param)] canvas_id: String, #[tool(param)] title: String, #[tool(param)] description: String, #[tool(param)] x: f64, #[tool(param)] y: f64, #[tool(param)] width: Option<f64>, #[tool(param)] height: Option<f64>, #[tool(param)] metadata_json: Option<String>, #[tool(param)] tags: Option<Vec<String>>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let w = width.unwrap_or(200.0);
        let h = height.unwrap_or(100.0);
        respond(&state, execute(Command::CanvasNodeCreate { canvas_id, title, description, x, y, width: w, height: h, metadata_json, tags }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all nodes on a visual canvas")]
    async fn node_list(&self, #[tool(param)] canvas_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeList { canvas_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Update a canvas node's title, description, position, size, metadata, or tags")]
    async fn node_update(&self, #[tool(param)] id: String, #[tool(param)] title: Option<String>, #[tool(param)] description: Option<String>, #[tool(param)] x: Option<f64>, #[tool(param)] y: Option<f64>, #[tool(param)] width: Option<f64>, #[tool(param)] height: Option<f64>, #[tool(param)] metadata_json: Option<String>, #[tool(param)] tags: Option<Vec<String>>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeUpdate { id, title, description, x, y, width, height, metadata_json, tags }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a canvas node. Cascades to remove connected edges and remove the node from any groups.")]
    async fn node_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let ack_id = id.clone();
        respond(&state, execute(Command::CanvasNodeDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Deleted(ack_id))
    }

    #[tool(description = "Add a source reference (file or link) to a canvas node")]
    async fn node_source_add(&self, #[tool(param)] node_id: String, #[tool(param)] url: String, #[tool(param)] source_type: String, #[tool(param)] sort_order: i32) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeSourceCreate { node_id, url, source_type, sort_order }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all source references for a canvas node")]
    async fn node_source_list(&self, #[tool(param)] node_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeSourceList { node_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Remove a source reference from a canvas node")]
    async fn node_source_remove(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let ack_id = id.clone();
        respond(&state, execute(Command::CanvasNodeSourceDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Deleted(ack_id))
    }

    #[tool(description = "Create a directional edge between two canvas nodes with optional label and metadata")]
    async fn edge_create(&self, #[tool(param)] canvas_id: String, #[tool(param)] source_node_id: String, #[tool(param)] target_node_id: String, #[tool(param)] label: Option<String>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasEdgeCreate { canvas_id, source_node_id, target_node_id, label, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all edges on a visual canvas")]
    async fn edge_list(&self, #[tool(param)] canvas_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasEdgeList { canvas_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Update a canvas edge's label, metadata, source, or target")]
    async fn edge_update(&self, #[tool(param)] id: String, #[tool(param)] source_node_id: Option<String>, #[tool(param)] target_node_id: Option<String>, #[tool(param)] label: Option<String>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasEdgeUpdate { id, source_node_id, target_node_id, label, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a canvas edge")]
    async fn edge_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let ack_id = id.clone();
        respond(&state, execute(Command::CanvasEdgeDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Deleted(ack_id))
    }

    #[tool(description = "Create a group to visually cluster related nodes with a label and list of node IDs")]
    async fn group_create(&self, #[tool(param)] canvas_id: String, #[tool(param)] label: String, #[tool(param)] node_ids: Vec<String>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let node_ids_json = serde_json::to_string(&node_ids).unwrap_or_else(|_| "[]".to_string());
        respond(&state, execute(Command::CanvasGroupCreate { canvas_id, label, node_ids_json, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all groups on a visual canvas")]
    async fn group_list(&self, #[tool(param)] canvas_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasGroupList { canvas_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Update a canvas group's label, node IDs, or metadata")]
    async fn group_update(&self, #[tool(param)] id: String, #[tool(param)] label: Option<String>, #[tool(param)] node_ids: Option<Vec<String>>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let node_ids_json = node_ids.map(|ids| serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string()));
        respond(&state, execute(Command::CanvasGroupUpdate { id, label, node_ids_json, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a canvas group")]
    async fn group_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let ack_id = id.clone();
        respond(&state, execute(Command::CanvasGroupDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Deleted(ack_id))
    }

    #[tool(
        description = "Batch-create nodes, edges, and optionally groups on a canvas in a single call. \
            This is the PREFERRED way to populate a canvas with multiple elements — it is more \
            efficient and coherent than making individual create calls. \
            Params: nodes (required, JSON array), edges (optional, JSON array), groups (optional, JSON array). \
            Each node: { ref?: string, title: string, description?: string, x?: number, y?: number, \
            width?: number, height?: number, metadata_json?: string, tags?: string[] }. \
            Each edge: { source: string, target: string, label?: string, metadata_json?: string }. \
            source/target accept EITHER a ref from this call's nodes OR an existing node UUID. \
            Each group: { label: string, node_refs: string[], metadata_json?: string }. \
            node_refs accept refs from this call's nodes OR existing node UUIDs. \
            Refs are temporary — they only exist within this call and are returned in the response \
            so the AI can reference newly-created nodes in edges/groups. Duplicate refs are an error. \
            The entire import is all-or-nothing: if any validation fails, nothing is created. \
            Returns the created nodes (with real UUIDs and their refs), edges, and groups."
    )]
    async fn canvas_import(
        &self,
        #[tool(param)] canvas_id: String,
        #[tool(param)] nodes: String,
        #[tool(param)] edges: Option<String>,
        #[tool(param)] groups: Option<String>,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasImport {
            canvas_id,
            nodes_json: nodes,
            edges_json: edges,
            groups_json: groups,
        }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Create a C4 diagram for a repository. The diagram_json must be a JSON object with nodes[], edges[], and groups[]. \
        Minimal node shape: {\"label\":\"...\", \"level\":\"context|container|component|code\"}. \
        Other optional fields: type, parent (match a node's label or id), file_path, code_snippet, line_start, line_end, metadata. \
        Fields id, x, y, width, height are OPTIONAL — positions are auto-assigned by the UI and ids default from the label. \
        Unknown fields are tolerated by the frontend parser.")]
    async fn c4_diagram_create(&self, #[tool(param)] repo_path: String, #[tool(param)] name: String, #[tool(param)] diagram_json: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::C4DiagramCreate { repo_path, name, diagram_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all C4 diagrams for a repository")]
    async fn c4_diagram_list(&self, #[tool(param)] repo_path: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::C4DiagramList { repo_path }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Get a C4 diagram by ID")]
    async fn c4_diagram_get(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::C4DiagramGet { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a C4 diagram")]
    async fn c4_diagram_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let ack_id = id.clone();
        respond(&state, execute(Command::C4DiagramDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Deleted(ack_id))
    }

    #[tool(description = "Rename a C4 diagram")]
    async fn c4_diagram_rename(&self, #[tool(param)] id: String, #[tool(param)] name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::C4DiagramRename { id, name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::RawContent;
    use tempfile::TempDir;

    #[test]
    fn test_scoped_out_git_file_tools_are_absent_from_tool_set() {
        let names: Vec<String> = McpHandler::tool_box().list().into_iter().map(|t| t.name.to_string()).collect();
        for removed in ["read_file_range", "blame", "search_history", "get_owners"] {
            assert!(!names.contains(&removed.to_string()), "{removed} should have been removed from the advertised tool set");
        }
    }

    #[test]
    fn test_redundant_get_and_issue_close_are_absent_from_tool_set() {
        let names: Vec<String> = McpHandler::tool_box().list().into_iter().map(|t| t.name.to_string()).collect();
        for removed in ["node_get", "edge_get", "group_get", "canvas_get", "issue_close"] {
            assert!(!names.contains(&removed.to_string()), "{removed} should have been removed from the advertised tool set");
        }
    }

    #[test]
    fn test_tag_tools_are_absent_from_tool_set() {
        let names: Vec<String> = McpHandler::tool_box().list().into_iter().map(|t| t.name.to_string()).collect();
        for removed in ["tag_add", "tag_remove", "tag_list"] {
            assert!(!names.contains(&removed.to_string()), "{removed} should have been removed from the advertised tool set");
        }
    }

    fn setup() -> (McpHandler, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("workspace.db");
        let db = Database::new(db_path);
        let handler = McpHandler {
            db,
            on_events: None,
            resolved_session_id: None,
            resolution_source: "env-var".to_string(),
        };
        (handler, dir)
    }

    fn extract_text(result: CallToolResult) -> String {
        result.content.first().and_then(|c| match &c.raw {
            RawContent::Text(t) => Some(t.text.clone()),
            _ => None,
        }).unwrap_or_default()
    }

    // --- Error mapping tests ---

    #[test]
    fn test_error_code_not_found() {
        let err = crate::error::to_mcp_error(
            ai_agent_workspace_commands::CommandError::not_found("session", "abc")
        );
        assert_eq!(err.code.0, -32001);
        assert!(err.data.is_some());
        let data = err.data.unwrap();
        assert_eq!(data["entity"], "session");
        assert_eq!(data["id"], "abc");
    }

    #[test]
    fn test_error_code_already_exists() {
        let err = crate::error::to_mcp_error(
            ai_agent_workspace_commands::CommandError::already_exists("template", "xyz")
        );
        assert_eq!(err.code.0, -32002);
    }

    #[test]
    fn test_error_code_invalid_input() {
        let err = crate::error::to_mcp_error(
            ai_agent_workspace_commands::CommandError::invalid_input("bad data")
        );
        assert_eq!(err.code.0, -32602);
    }

    #[test]
    fn test_error_code_internal() {
        let err = crate::error::to_mcp_error(
            ai_agent_workspace_commands::CommandError::internal("oops")
        );
        assert_eq!(err.code.0, -32000);
    }

    // --- Issue tool tests ---

    fn setup_with_session() -> (McpHandler, TempDir) {
        let (mut handler, dir) = setup();
        let session_id = {
            let conn = handler.db.connection().unwrap();
            let sessions = handler.db.sessions(&conn);
            let session = sessions.create("/tmp/test", "Test Session").unwrap();
            session.id
        };
        handler.resolved_session_id = Some(session_id);
        (handler, dir)
    }

    #[tokio::test]
    async fn test_issue_search_no_filters() {
        let (handler, _dir) = setup_with_session();
        handler.issue_create("Bug".into(), "crash".into()).await.unwrap();
        handler.issue_create("Feature".into(), "add thing".into()).await.unwrap();

        let result = handler.issue_search(None, None, None).await.unwrap();
        let text = extract_text(result);
        let issues: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(issues.as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn test_issue_search_by_state() {
        let (handler, _dir) = setup_with_session();
        handler.issue_create("Open".into(), "".into()).await.unwrap();
        let r = handler.issue_create("ToClose".into(), "".into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(r)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        handler.issue_update(id, None, None, None, Some("closed".into())).await.unwrap();

        let result = handler.issue_search(Some("open".into()), None, None).await.unwrap();
        let issues: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(issues.as_array().unwrap().len(), 1);
        assert_eq!(issues[0]["title"], "Open");
    }

    #[tokio::test]
    async fn test_issue_search_by_keyword() {
        let (handler, _dir) = setup_with_session();
        handler.issue_create("Login bug".into(), "auth fails".into()).await.unwrap();
        handler.issue_create("Docs update".into(), "rewrite readme".into()).await.unwrap();

        let result = handler.issue_search(None, None, Some("login".into())).await.unwrap();
        let issues: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(issues.as_array().unwrap().len(), 1);
        assert_eq!(issues[0]["title"], "Login bug");
    }

    #[tokio::test]
    async fn test_issue_search_by_label() {
        let (handler, _dir) = setup_with_session();
        let r = handler.issue_create("Ready".into(), "".into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(r)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        handler.issue_update(id, None, None, Some(vec!["ready-for-agent".into()]), None).await.unwrap();
        handler.issue_create("Triage".into(), "".into()).await.unwrap();

        let result = handler.issue_search(None, Some("ready-for-agent".into()), None).await.unwrap();
        let issues: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(issues.as_array().unwrap().len(), 1);
        assert_eq!(issues[0]["title"], "Ready");
    }

    #[tokio::test]
    async fn test_issue_get_next_null_when_empty() {
        let (handler, _dir) = setup_with_session();
        let result = handler.issue_get_next().await.unwrap();
        let text = extract_text(result);
        assert_eq!(text, "null");
    }

    #[tokio::test]
    async fn test_issue_get_next_returns_highest_priority() {
        let (handler, _dir) = setup_with_session();
        handler.issue_create("Triage issue".into(), "".into()).await.unwrap();
        let r = handler.issue_create("Agent issue".into(), "".into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(r)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        handler.issue_update(id, None, None, Some(vec!["ready-for-agent".into()]), None).await.unwrap();

        let result = handler.issue_get_next().await.unwrap();
        let text = extract_text(result);
        let issue: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(issue["title"], "Agent issue");
    }

    #[tokio::test]
    async fn test_issue_get_next_null_when_all_closed() {
        let (handler, _dir) = setup_with_session();
        let r = handler.issue_create("Issue".into(), "".into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(r)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        handler.issue_update(id, None, None, None, Some("closed".into())).await.unwrap();

        let result = handler.issue_get_next().await.unwrap();
        let text = extract_text(result);
        assert_eq!(text, "null");
    }

    #[tokio::test]
    async fn test_issue_summarize_backlog_empty() {
        let (handler, _dir) = setup_with_session();
        let result = handler.issue_summarize_backlog().await.unwrap();
        let text = extract_text(result);
        let summary: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(summary["total"], 0);
        assert_eq!(summary["open"], 0);
        assert_eq!(summary["closed"], 0);
    }

    #[tokio::test]
    async fn test_issue_summarize_backlog_counts() {
        let (handler, _dir) = setup_with_session();
        handler.issue_create("A".into(), "".into()).await.unwrap();
        handler.issue_create("B".into(), "".into()).await.unwrap();
        let r = handler.issue_create("C".into(), "".into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(r)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();
        handler.issue_update(id, None, None, None, Some("closed".into())).await.unwrap();

        let result = handler.issue_summarize_backlog().await.unwrap();
        let text = extract_text(result);
        let summary: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(summary["total"], 3);
        assert_eq!(summary["open"], 2);
        assert_eq!(summary["closed"], 1);
        assert_eq!(summary["by_label"]["needs-triage"], 3);
    }

    // --- canvas_import tool tests ---

    fn setup_canvas(handler: &McpHandler) -> (String, String) {
        let conn = handler.db.connection().unwrap();
        let sessions = handler.db.sessions(&conn);
        let session = sessions.create("/tmp/import_test", "Import Test").unwrap();
        let canvases = handler.db.visual_canvases(&conn);
        let canvas = canvases.create(&session.id, "Import Canvas").unwrap();
        (session.id, canvas.id)
    }

    fn setup_with_session_and_canvas() -> (McpHandler, TempDir, String) {
        let (mut handler, dir) = setup();
        let (session_id, canvas_id) = setup_canvas(&handler);
        handler.resolved_session_id = Some(session_id);
        (handler, dir, canvas_id)
    }

    #[tokio::test]
    async fn test_canvas_import_basic() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let nodes = r#"[
            {"ref": "a", "title": "Login", "x": 100, "y": 100},
            {"ref": "b", "title": "Dashboard", "x": 300, "y": 100}
        ]"#;
        let edges = r#"[
            {"source": "a", "target": "b", "label": "navigates to"}
        ]"#;
        let result = handler.canvas_import(canvas_id.clone(), nodes.into(), Some(edges.into()), None).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();

        // Check nodes
        let nodes_arr = data["nodes"].as_array().unwrap();
        assert_eq!(nodes_arr.len(), 2);
        assert_eq!(nodes_arr[0]["title"], "Login");
        assert_eq!(nodes_arr[0]["ref"], "a");
        assert!(nodes_arr[0]["id"].as_str().unwrap().len() > 10);
        assert_eq!(nodes_arr[1]["title"], "Dashboard");
        assert_eq!(nodes_arr[1]["ref"], "b");

        // Check edges
        let edges_arr = data["edges"].as_array().unwrap();
        assert_eq!(edges_arr.len(), 1);
        assert_eq!(edges_arr[0]["label"], "navigates to");

        // Verify persisted to DB
        let conn = handler.db.connection().unwrap();
        let nodes_repo = handler.db.canvas_nodes(&conn);
        let persisted = nodes_repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(persisted.len(), 2);
    }

    #[tokio::test]
    async fn test_canvas_import_with_groups() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let nodes = r#"[
            {"ref": "n1", "title": "Auth Module"},
            {"ref": "n2", "title": "UI Module"},
            {"ref": "n3", "title": "DB Module"}
        ]"#;
        let groups = r#"[
            {"label": "Backend", "node_refs": ["n1", "n3"]},
            {"label": "Frontend", "node_refs": ["n2"]}
        ]"#;
        let result = handler.canvas_import(canvas_id.clone(), nodes.into(), None, Some(groups.into())).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();

        assert_eq!(data["nodes"].as_array().unwrap().len(), 3);
        assert_eq!(data["groups"].as_array().unwrap().len(), 2);
        assert_eq!(data["groups"][0]["label"], "Backend");
    }

    #[tokio::test]
    async fn test_canvas_import_duplicate_ref() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let nodes = r#"[
            {"ref": "dup", "title": "First"},
            {"ref": "dup", "title": "Second"}
        ]"#;
        let result = handler.canvas_import(canvas_id.clone(), nodes.into(), None, None).await;
        assert!(result.is_err(), "Expected error for duplicate refs");
        let err = result.unwrap_err();
        assert!(err.message.contains("Duplicate ref") || err.message.contains("dup"));
    }

    #[tokio::test]
    async fn test_canvas_import_bad_canvas() {
        let (handler, _dir, _) = setup_with_session_and_canvas();
        let nodes = r#"[
            {"title": "Node"}
        ]"#;
        let result = handler.canvas_import("nonexistent-canvas-id".into(), nodes.into(), None, None).await;
        assert!(result.is_err(), "Expected error for nonexistent canvas");
    }

    #[tokio::test]
    async fn test_canvas_import_unresolvable_edge() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let nodes = r#"[
            {"ref": "a", "title": "Source"}
        ]"#;
        let edges = r#"[
            {"source": "a", "target": "nonexistent-ref"}
        ]"#;
        let result = handler.canvas_import(canvas_id.clone(), nodes.into(), Some(edges.into()), None).await;
        assert!(result.is_err(), "Expected error for unresolvable edge target");
        // Nothing should have been created
        let conn = handler.db.connection().unwrap();
        let nodes_repo = handler.db.canvas_nodes(&conn);
        let persisted = nodes_repo.list_by_canvas(&canvas_id).unwrap();
        assert!(persisted.is_empty(), "All-or-nothing: no nodes should persist on error");
    }

    #[tokio::test]
    async fn test_canvas_import_append_to_existing() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        // First, create an existing node
        let existing_node_id = {
            let conn = handler.db.connection().unwrap();
            let nodes_repo = handler.db.canvas_nodes(&conn);
            nodes_repo.create(&canvas_id, "Existing Node", "", 0.0, 0.0, 100.0, 50.0, None, None).unwrap().id
        };

        // Now import using the existing UUID as an edge endpoint
        let nodes = r#"[
            {"ref": "x", "title": "New Node"}
        ]"#;
        let edges_json = format!(r#"[
            {{"source": "{}", "target": "x", "label": "connects"}}
        ]"#, existing_node_id);
        let result = handler.canvas_import(canvas_id.clone(), nodes.into(), Some(edges_json), None).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(data["nodes"].as_array().unwrap().len(), 1);
        assert_eq!(data["edges"].as_array().unwrap().len(), 1);

        // Verify both nodes exist
        let conn = handler.db.connection().unwrap();
        let nodes_repo = handler.db.canvas_nodes(&conn);
        let persisted = nodes_repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(persisted.len(), 2);
    }

    #[tokio::test]
    async fn test_canvas_import_edges_only_use_new_refs_and_existing_uuids() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        // Create existing node
        let existing_id = {
            let conn = handler.db.connection().unwrap();
            handler.db.canvas_nodes(&conn).create(&canvas_id, "Existing", "", 0.0, 0.0, 100.0, 50.0, None, None).unwrap().id
        };

        let nodes = r#"[
            {"ref": "new_node", "title": "New Node"}
        ]"#;
        let edges = format!(r#"[
            {{"source": "new_node", "target": "{}"}}
        ]"#, existing_id);
        let result = handler.canvas_import(canvas_id.clone(), nodes.into(), Some(edges), None).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["edges"].as_array().unwrap().len(), 1);
    }

    // --- Response shaping tests ---

    fn assert_no_hidden_fields(value: &serde_json::Value) {
        match value {
            serde_json::Value::Object(map) => {
                assert!(!map.contains_key("session_id"), "session_id leaked: {}", value);
                assert!(!map.contains_key("created_at"), "created_at leaked: {}", value);
                assert!(!map.contains_key("updated_at"), "updated_at leaked: {}", value);
                for v in map.values() {
                    assert_no_hidden_fields(v);
                }
            }
            serde_json::Value::Array(items) => {
                for v in items {
                    assert_no_hidden_fields(v);
                }
            }
            _ => {}
        }
    }

    #[tokio::test]
    async fn test_issue_create_omits_session_and_timestamps() {
        let (handler, _dir) = setup_with_session();
        let result = handler.issue_create("Bug".into(), "crash".into()).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_no_hidden_fields(&data);
        assert_eq!(data["title"], "Bug");
    }

    #[tokio::test]
    async fn test_issue_list_omits_session_and_timestamps() {
        let (handler, _dir) = setup_with_session();
        handler.issue_create("Bug".into(), "crash".into()).await.unwrap();
        let result = handler.issue_list().await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_no_hidden_fields(&data);
    }

    #[tokio::test]
    async fn test_issue_list_is_summary_projection_without_body() {
        let (handler, _dir) = setup_with_session();
        handler.issue_create("Bug".into(), "full body text".into()).await.unwrap();
        let result = handler.issue_list().await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        let items = data.as_array().unwrap();
        assert_eq!(items.len(), 1);
        let item = &items[0];
        assert!(item.get("body").is_none(), "issue_list must not include body");
        assert!(item.get("number").is_some());
        assert!(item.get("title").is_some());
        assert!(item.get("labels").is_some());
        assert!(item.get("state").is_some());
        assert_eq!(item.as_object().unwrap().len(), 4, "issue_list must project exactly number/title/labels/state");
    }

    #[tokio::test]
    async fn test_issue_get_keeps_full_body() {
        let (handler, _dir) = setup_with_session();
        let r = handler.issue_create("Bug".into(), "full body text".into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(r)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();

        let result = handler.issue_get(id).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["body"], "full body text");
        assert_no_hidden_fields(&data);
    }

    #[tokio::test]
    async fn test_issue_update_state_closed_persists() {
        let (handler, _dir) = setup_with_session();
        let r = handler.issue_create("Bug".into(), "".into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(r)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();

        handler.issue_update(id.clone(), None, None, None, Some("closed".into())).await.unwrap();

        let result = handler.issue_get(id).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["state"], "closed");
    }

    #[tokio::test]
    async fn test_issue_delete_returns_ack() {
        let (handler, _dir) = setup_with_session();
        let r = handler.issue_create("Bug".into(), "".into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(r)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();

        let result = handler.issue_delete(id.clone()).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["deleted"], true);
        assert_eq!(data["id"], id);
    }

    #[tokio::test]
    async fn test_node_delete_returns_ack() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let create_result = handler.node_create(canvas_id, "Node".into(), "".into(), 0.0, 0.0, None, None, None, None).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(create_result)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();

        let result = handler.node_delete(id.clone()).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["deleted"], true);
        assert_eq!(data["id"], id);
    }

    #[tokio::test]
    async fn test_edge_delete_returns_ack() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let n1 = handler.node_create(canvas_id.clone(), "A".into(), "".into(), 0.0, 0.0, None, None, None, None).await.unwrap();
        let n1: serde_json::Value = serde_json::from_str(&extract_text(n1)).unwrap();
        let n2 = handler.node_create(canvas_id.clone(), "B".into(), "".into(), 0.0, 0.0, None, None, None, None).await.unwrap();
        let n2: serde_json::Value = serde_json::from_str(&extract_text(n2)).unwrap();
        let edge = handler.edge_create(canvas_id, n1["id"].as_str().unwrap().into(), n2["id"].as_str().unwrap().into(), None, None).await.unwrap();
        let edge: serde_json::Value = serde_json::from_str(&extract_text(edge)).unwrap();
        let id = edge["id"].as_str().unwrap().to_string();

        let result = handler.edge_delete(id.clone()).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["deleted"], true);
        assert_eq!(data["id"], id);
    }

    #[tokio::test]
    async fn test_group_delete_returns_ack() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let group = handler.group_create(canvas_id, "Group".into(), vec![], None).await.unwrap();
        let group: serde_json::Value = serde_json::from_str(&extract_text(group)).unwrap();
        let id = group["id"].as_str().unwrap().to_string();

        let result = handler.group_delete(id.clone()).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["deleted"], true);
        assert_eq!(data["id"], id);
    }

    #[tokio::test]
    async fn test_canvas_delete_returns_ack() {
        let (handler, _dir) = setup_with_session();
        let canvas = handler.canvas_create("My Canvas".into()).await.unwrap();
        let canvas: serde_json::Value = serde_json::from_str(&extract_text(canvas)).unwrap();
        let id = canvas["id"].as_str().unwrap().to_string();

        let result = handler.canvas_delete(id.clone()).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["deleted"], true);
        assert_eq!(data["id"], id);
    }

    #[tokio::test]
    async fn test_c4_diagram_delete_returns_ack() {
        let (handler, _dir) = setup();
        let diagram = handler.c4_diagram_create("/tmp/repo".into(), "Diagram".into(), r#"{"nodes":[],"edges":[],"groups":[]}"#.into()).await.unwrap();
        let diagram: serde_json::Value = serde_json::from_str(&extract_text(diagram)).unwrap();
        let id = diagram["id"].as_str().unwrap().to_string();

        let result = handler.c4_diagram_delete(id.clone()).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert_eq!(data["deleted"], true);
        assert_eq!(data["id"], id);
    }

    #[tokio::test]
    async fn test_node_create_returns_metadata_as_nested_json_not_escaped_string() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let result = handler.node_create(
            canvas_id, "Node".into(), "".into(), 0.0, 0.0, None, None,
            Some(r#"{"color": "red", "size": 3}"#.into()), None,
        ).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();

        assert!(data.get("metadata_json").is_none(), "raw metadata_json field must not leak");
        assert_eq!(data["metadata"]["color"], "red");
        assert_eq!(data["metadata"]["size"], 3);
    }

    #[tokio::test]
    async fn test_node_get_via_list_returns_metadata_as_nested_json() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        handler.node_create(
            canvas_id.clone(), "Node".into(), "".into(), 0.0, 0.0, None, None,
            Some(r#"{"nested": {"a": 1}}"#.into()), None,
        ).await.unwrap();
        let result = handler.node_list(canvas_id).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        let node = &data.as_array().unwrap()[0];
        assert_eq!(node["metadata"]["nested"]["a"], 1);
        assert_no_hidden_fields(&data);
    }

    #[tokio::test]
    async fn test_node_create_sets_and_returns_tags() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let result = handler.node_create(
            canvas_id, "Node".into(), "".into(), 0.0, 0.0, None, None, None,
            Some(vec!["bug".to_string(), "urgent".to_string()]),
        ).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();

        assert!(data.get("tags_json").is_none(), "raw tags_json field must not leak");
        let tags: Vec<String> = serde_json::from_value(data["tags"].clone()).unwrap();
        assert_eq!(tags, vec!["bug".to_string(), "urgent".to_string()]);
    }

    #[tokio::test]
    async fn test_node_update_sets_and_returns_tags() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let created = handler.node_create(canvas_id, "Node".into(), "".into(), 0.0, 0.0, None, None, None, None).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(created)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();

        let result = handler.node_update(id, None, None, None, None, None, None, None, Some(vec!["reviewed".to_string()])).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        let tags: Vec<String> = serde_json::from_value(data["tags"].clone()).unwrap();
        assert_eq!(tags, vec!["reviewed".to_string()]);
    }

    #[tokio::test]
    async fn test_node_list_returns_tags_inline() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        handler.node_create(
            canvas_id.clone(), "Node".into(), "".into(), 0.0, 0.0, None, None, None,
            Some(vec!["a".to_string()]),
        ).await.unwrap();
        let result = handler.node_list(canvas_id).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        let node = &data.as_array().unwrap()[0];
        let tags: Vec<String> = serde_json::from_value(node["tags"].clone()).unwrap();
        assert_eq!(tags, vec!["a".to_string()]);
    }

    #[tokio::test]
    async fn test_canvas_import_sets_node_tags() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let nodes = r#"[
            {"ref": "a", "title": "Login", "tags": ["auth", "priority:high"]}
        ]"#;
        let result = handler.canvas_import(canvas_id, nodes.into(), None, None).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        let node = &data["nodes"].as_array().unwrap()[0];
        let tags: Vec<String> = serde_json::from_value(node["tags"].clone()).unwrap();
        assert_eq!(tags, vec!["auth".to_string(), "priority:high".to_string()]);
    }

    #[tokio::test]
    async fn test_group_create_returns_node_ids_as_nested_json() {
        let (handler, _dir, canvas_id) = setup_with_session_and_canvas();
        let n1 = handler.node_create(canvas_id.clone(), "A".into(), "".into(), 0.0, 0.0, None, None, None, None).await.unwrap();
        let n1: serde_json::Value = serde_json::from_str(&extract_text(n1)).unwrap();
        let node_id = n1["id"].as_str().unwrap().to_string();

        let result = handler.group_create(canvas_id, "Group".into(), vec![node_id.clone()], None).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();

        assert!(data.get("node_ids_json").is_none(), "raw node_ids_json field must not leak");
        assert_eq!(data["node_ids"][0], node_id);
    }

    #[tokio::test]
    async fn test_c4_diagram_list_returns_metadata_only_no_diagram_json() {
        let (handler, _dir) = setup();
        handler.c4_diagram_create("/tmp/repo".into(), "Diagram".into(), r#"{"nodes":[{"label":"a"}],"edges":[],"groups":[]}"#.into()).await.unwrap();

        let result = handler.c4_diagram_list("/tmp/repo".into()).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        let items = data.as_array().unwrap();
        assert_eq!(items.len(), 1);
        let item = &items[0];
        assert!(item.get("diagram_json").is_none());
        assert!(item.get("diagram").is_none(), "c4_diagram_list must not include diagram JSON at all");
        assert!(item.get("id").is_some());
        assert!(item.get("repo_path").is_some());
        assert!(item.get("name").is_some());
        assert_no_hidden_fields(&data);
    }

    #[tokio::test]
    async fn test_c4_diagram_get_keeps_diagram_json_as_nested_json() {
        let (handler, _dir) = setup();
        let created = handler.c4_diagram_create("/tmp/repo".into(), "Diagram".into(), r#"{"nodes":[{"label":"a"}],"edges":[],"groups":[]}"#.into()).await.unwrap();
        let created: serde_json::Value = serde_json::from_str(&extract_text(created)).unwrap();
        let id = created["id"].as_str().unwrap().to_string();

        let result = handler.c4_diagram_get(id).await.unwrap();
        let data: serde_json::Value = serde_json::from_str(&extract_text(result)).unwrap();
        assert!(data.get("diagram_json").is_none(), "raw diagram_json field must not leak");
        assert_eq!(data["diagram"]["nodes"][0]["label"], "a");
        assert_no_hidden_fields(&data);
    }
}

#[cfg(feature = "tauri-integration")]
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("mcp")
        .setup(|app, _config| {
            let state = app.state::<AppState>();
            let db = state.db.clone();
            let handle = app.app_handle().clone();

            let on_events: Option<Arc<dyn Fn(&[DomainEvent]) + Send + Sync>> = {
                let h = handle.clone();
                Some(Arc::new(move |events: &[DomainEvent]| {
                    for event in events {
                        match event {
                            DomainEvent::SessionsChanged => {
                                let _ = h.emit("sessions-changed", ());
                            }
                            DomainEvent::LayoutsChanged => {
                                let _ = h.emit("layouts-changed", ());
                            }
                            DomainEvent::WorkspaceChanged { session_id, workspace_id, screen } => {
                                let _ = h.emit("workspace-changed", serde_json::json!({
                                    "session_id": session_id,
                                    "workspace_id": workspace_id,
                                    "screen": screen,
                                }));
                            }
                            DomainEvent::IssuesChanged { session_id } => {
                                let _ = h.emit("issues-changed", serde_json::json!({
                                    "session_id": session_id,
                                }));
                            }
                            DomainEvent::VisualCanvasesChanged { session_id } => {
                                let _ = h.emit("visual-canvases-changed", serde_json::json!({
                                    "session_id": session_id,
                                }));
                            }
                            DomainEvent::CanvasNodesChanged { session_id, canvas_id } => {
                                let _ = h.emit("canvas-nodes-changed", serde_json::json!({
                                    "session_id": session_id,
                                    "canvas_id": canvas_id,
                                }));
                            }
                            DomainEvent::CanvasEdgesChanged { session_id, canvas_id } => {
                                let _ = h.emit("canvas-edges-changed", serde_json::json!({
                                    "session_id": session_id,
                                    "canvas_id": canvas_id,
                                }));
                            }
                            DomainEvent::CanvasGroupsChanged { session_id, canvas_id } => {
                                let _ = h.emit("canvas-groups-changed", serde_json::json!({
                                    "session_id": session_id,
                                    "canvas_id": canvas_id,
                                }));
                            }
                            DomainEvent::CanvasNodeSourcesChanged { session_id, canvas_id } => {
                                let _ = h.emit("canvas-node-sources-changed", serde_json::json!({
                                    "session_id": session_id,
                                    "canvas_id": canvas_id,
                                }));
                            }
                            DomainEvent::C4DiagramsChanged { repo_path: _ } => {
                                let _ = h.emit("c4-diagrams-changed", ());
                            }
                        }
                    }
                }) as Arc<dyn Fn(&[DomainEvent]) + Send + Sync>)
            };

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new()
                    .expect("failed to create tokio runtime for MCP server");
                rt.block_on(async {
                    let handler = McpHandler {
                        db,
                        on_events,
                        resolved_session_id: None,
                        resolution_source: "env-var".to_string(),
                    };
                    match serve_server(handler, rmcp::transport::io::stdio()).await {
                        Ok(running) => {
                            let _ = running.waiting().await;
                        }
                        Err(e) => {
                            eprintln!("[mcp] Server error: {}", e);
                        }
                    }
                });
            });

            Ok(())
        })
        .build()
}
