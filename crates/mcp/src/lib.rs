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
    Empty,
    JsonOrNull,
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
        ResponseFormat::Empty => Ok(CallToolResult::success(vec![])),
        ResponseFormat::Json => Ok(CallToolResult::success(vec![
            Content::json(&outcome.result)?,
        ])),
        ResponseFormat::JsonOrNull => {
            if matches!(outcome.result, CommandResult::Unit(())) {
                Ok(CallToolResult::success(vec![
                    Content::json(&serde_json::Value::Null)?,
                ]))
            } else {
                Ok(CallToolResult::success(vec![
                    Content::json(&outcome.result)?,
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
        issue_close,
        issue_delete,
        issue_search,
        issue_get_next,
        issue_summarize_backlog,
        canvas_create,
        canvas_list,
        canvas_get,
        canvas_delete,
        canvas_rename,
        node_create,
        node_list,
        node_get,
        node_update,
        node_delete,
        node_source_add,
        node_source_list,
        node_source_remove,
        edge_create,
        edge_list,
        edge_get,
        edge_update,
        edge_delete,
        group_create,
        group_list,
        group_get,
        group_update,
        group_delete,
        canvas_import,
        tag_add,
        tag_remove,
        tag_list,
        c4_diagram_create,
        c4_diagram_list,
        c4_diagram_get,
        c4_diagram_delete,
        c4_diagram_rename,
        read_file_range,
        search_history,
        blame,
        get_owners
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

    #[tool(description = "Close an issue. The id parameter accepts both UUID and issue number (e.g. '5')")]
    async fn issue_close(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::IssueClose { id, session_id: Some(session_id) }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete an issue. The id parameter accepts both UUID and issue number (e.g. '5')")]
    async fn issue_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::IssueDelete { id, session_id: Some(session_id) }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
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

    #[tool(description = "Get a visual canvas by ID")]
    async fn canvas_get(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::VisualCanvasGet { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a visual canvas")]
    async fn canvas_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::VisualCanvasDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "Rename a visual canvas")]
    async fn canvas_rename(&self, #[tool(param)] id: String, #[tool(param)] name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::VisualCanvasRename { id, name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Create a node on a visual canvas with title, description, position, and optional metadata")]
    async fn node_create(&self, #[tool(param)] canvas_id: String, #[tool(param)] title: String, #[tool(param)] description: String, #[tool(param)] x: f64, #[tool(param)] y: f64, #[tool(param)] width: Option<f64>, #[tool(param)] height: Option<f64>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let w = width.unwrap_or(200.0);
        let h = height.unwrap_or(100.0);
        respond(&state, execute(Command::CanvasNodeCreate { canvas_id, title, description, x, y, width: w, height: h, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all nodes on a visual canvas")]
    async fn node_list(&self, #[tool(param)] canvas_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeList { canvas_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Get a canvas node by ID")]
    async fn node_get(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeGet { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Update a canvas node's title, description, position, size, or metadata")]
    async fn node_update(&self, #[tool(param)] id: String, #[tool(param)] title: Option<String>, #[tool(param)] description: Option<String>, #[tool(param)] x: Option<f64>, #[tool(param)] y: Option<f64>, #[tool(param)] width: Option<f64>, #[tool(param)] height: Option<f64>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeUpdate { id, title, description, x, y, width, height, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a canvas node. Cascades to remove connected edges and remove the node from any groups.")]
    async fn node_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
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
        respond(&state, execute(Command::CanvasNodeSourceDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
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

    #[tool(description = "Get a canvas edge by ID")]
    async fn edge_get(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasEdgeGet { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Update a canvas edge's label, metadata, source, or target")]
    async fn edge_update(&self, #[tool(param)] id: String, #[tool(param)] source_node_id: Option<String>, #[tool(param)] target_node_id: Option<String>, #[tool(param)] label: Option<String>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasEdgeUpdate { id, source_node_id, target_node_id, label, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a canvas edge")]
    async fn edge_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasEdgeDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
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

    #[tool(description = "Get a canvas group by ID")]
    async fn group_get(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasGroupGet { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
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
        respond(&state, execute(Command::CanvasGroupDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(
        description = "Batch-create nodes, edges, and optionally groups on a canvas in a single call. \
            This is the PREFERRED way to populate a canvas with multiple elements — it is more \
            efficient and coherent than making individual create calls. \
            Params: nodes (required, JSON array), edges (optional, JSON array), groups (optional, JSON array). \
            Each node: { ref?: string, title: string, description?: string, x?: number, y?: number, \
            width?: number, height?: number, metadata_json?: string }. \
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

    #[tool(description = "Add a tag to a canvas node for categorization")]
    async fn tag_add(&self, #[tool(param)] node_id: String, #[tool(param)] tag: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasTagAdd { node_id, tag }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Remove a tag from a canvas node")]
    async fn tag_remove(&self, #[tool(param)] node_id: String, #[tool(param)] tag: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasTagRemove { node_id, tag }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "List tags for a canvas node or all tags on a canvas. Provide node_id to list tags for a specific node, or canvas_id to list all tags on a canvas.")]
    async fn tag_list(&self, #[tool(param)] node_id: Option<String>, #[tool(param)] canvas_id: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        if let Some(node_id) = node_id {
            respond(&state, execute(Command::CanvasTagListByNode { node_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
        } else if let Some(canvas_id) = canvas_id {
            respond(&state, execute(Command::CanvasTagListByCanvas { canvas_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
        } else {
            Err(rmcp::Error::invalid_params("Either node_id or canvas_id must be provided", None))
        }
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
        respond(&state, execute(Command::C4DiagramDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "Rename a C4 diagram")]
    async fn c4_diagram_rename(&self, #[tool(param)] id: String, #[tool(param)] name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::C4DiagramRename { id, name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Read a specific range of lines from a file in the working directory")]
    async fn read_file_range(&self, #[tool(param)] file_path: String, #[tool(param)] start_line: i32, #[tool(param)] end_line: i32) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let repo_path = self.db.get_working_directory(&session_id).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let full_path = std::path::PathBuf::from(&repo_path).join(&file_path);
        let content = std::fs::read_to_string(&full_path).map_err(|e| rmcp::Error::internal_error(format!("Failed to read {}: {}", file_path, e), None))?;
        let lines: Vec<&str> = content.lines().collect();
        let start = (start_line - 1).max(0) as usize;
        let end = (end_line as usize).min(lines.len());
        if start >= lines.len() {
            return Ok(CallToolResult::success(vec![Content::text("")]));
        }
        let slice: String = lines[start..end].join("\n");
        Ok(CallToolResult::success(vec![Content::text(slice)]))
    }

    #[tool(description = "Search git commit history by keyword, author, and date range")]
    async fn search_history(
        &self,
        #[tool(param)] keyword: Option<String>,
        #[tool(param)] author: Option<String>,
        #[tool(param)] after: Option<String>,
        #[tool(param)] before: Option<String>,
        #[tool(param)] max_results: Option<u32>,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let repo_path = self.db.get_working_directory(&session_id)
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let commits = ai_agent_workspace_git_operations::search_history(
            &repo_path,
            keyword.as_deref(),
            author.as_deref(),
            after.as_deref(),
            before.as_deref(),
            max_results,
        )
        .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&commits)?]))
    }

    #[tool(description = "Run git blame on a file to see per-line ownership")]
    async fn blame(
        &self,
        #[tool(param)] file_path: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let repo_path = self.db.get_working_directory(&session_id)
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let entries = ai_agent_workspace_git_operations::blame(&repo_path, &file_path)
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&entries)?]))
    }

    #[tool(description = "Parse CODEOWNERS file to find owners for a given path")]
    async fn get_owners(
        &self,
        #[tool(param)] path: Option<String>,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let repo_path = self.db.get_working_directory(&session_id)
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let result = ai_agent_workspace_git_operations::get_owners(&repo_path, path.as_deref())
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&result)?]))
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::RawContent;
    use tempfile::TempDir;

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

    // --- Session tool tests ---

    #[tokio::test]
    async fn test_session_list_empty() {
        let (handler, _dir) = setup();
        let result = handler.session_list().await.unwrap();
        assert_eq!(result.content.len(), 1);
        let text = extract_text(result);
        assert_eq!(text, "[]");
    }

    #[tokio::test]
    async fn test_session_create_then_list() {
        let (handler, _dir) = setup();
        let result = handler.session_create("/tmp/test".into(), "Test Session".into()).await.unwrap();
        let text = extract_text(result);
        assert!(text.contains("Test Session"));
        assert!(text.contains("/tmp/test"));

        let list = handler.session_list().await.unwrap();
        let list_text = extract_text(list);
        assert!(list_text.contains("Test Session"));
    }

    #[tokio::test]
    async fn test_session_create_global() {
        let (handler, _dir) = setup();
        let result = handler.session_create("/tmp/global".into(), "Global".into()).await;
        assert!(result.is_ok());
        let text = extract_text(result.unwrap());
        assert!(text.contains("Global"));
    }

    #[tokio::test]
    async fn test_session_delete_not_found() {
        let (handler, _dir) = setup();
        let result = handler.session_delete("nonexistent".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code.0, -32001);
        let data = err.data.unwrap();
        assert_eq!(data["entity"], "session");
    }

    #[tokio::test]
    async fn test_session_rename_not_found() {
        let (handler, _dir) = setup();
        let result = handler.session_rename("nonexistent".into(), "New".into()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code.0, -32001);
    }

    // --- Template tool tests ---

    #[tokio::test]
    async fn test_template_list_empty() {
        let (handler, _dir) = setup();
        let result = handler.template_list().await.unwrap();
        let text = extract_text(result);
        assert_eq!(text, "[]");
    }

    #[tokio::test]
    async fn test_template_save_and_list() {
        let (handler, _dir) = setup();
        let screen = ai_agent_workspace_core::Screen::default();
        let result = handler.template_save("My Template".into(), screen).await.unwrap();
        let text = extract_text(result);
        assert!(text.contains("My Template"));

        let list = handler.template_list().await.unwrap();
        let list_text = extract_text(list);
        assert!(list_text.contains("My Template"));
    }

    #[tokio::test]
    async fn test_template_delete_not_found() {
        let (handler, _dir) = setup();
        let result = handler.template_delete("nonexistent".into()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code.0, -32001);
    }

    #[tokio::test]
    async fn test_template_rename_not_found() {
        let (handler, _dir) = setup();
        let result = handler.template_rename("nonexistent".into(), "New".into()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code.0, -32001);
    }

    // --- Workspace tool tests ---

    #[tokio::test]
    async fn test_workspace_requires_session_id() {
        let (mut handler, _dir) = setup();
        handler.resolved_session_id = None;
        std::env::remove_var("AIAW_SESSION_ID");
        let result = handler.workspace_list().await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code.0, -32602);
        assert!(err.message.contains("AIAW_SESSION_ID"));
    }

    #[tokio::test]
    async fn test_workspace_get_active_requires_session_id() {
        let (mut handler, _dir) = setup();
        handler.resolved_session_id = None;
        std::env::remove_var("AIAW_SESSION_ID");
        let result = handler.workspace_get_active().await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code.0, -32602);
    }

    #[tokio::test]
    async fn test_workspace_add_and_list_with_session() {
        let (mut handler, _dir) = setup();

        let create_result = handler.session_create("/tmp/ws_test".into(), "WS Test".into()).await.unwrap();
        let create_text = extract_text(create_result);

        let session: serde_json::Value = serde_json::from_str(&create_text).unwrap();
        let session_id = session["id"].as_str().unwrap().to_string();

        handler.resolved_session_id = Some(session_id);

        let mut terminal_screen = ai_agent_workspace_core::Screen::new();
        terminal_screen.areas[0].panel_type = "terminal".to_string();
        let tmpl_result = handler.template_save("WS Template".into(), terminal_screen).await.unwrap();
        let tmpl_text = extract_text(tmpl_result);
        let tmpl: serde_json::Value = serde_json::from_str(&tmpl_text).unwrap();
        let template_id = tmpl["id"].as_str().unwrap().to_string();

        let add_result = handler.workspace_add(template_id.clone()).await.unwrap();
        let add_text = extract_text(add_result);
        assert!(add_text.contains("WS Template"));

        let list_result = handler.workspace_list().await.unwrap();
        let list_text = extract_text(list_result);
        assert!(list_text.contains("WS Template"));

        let active_result = handler.workspace_get_active().await.unwrap();
        let active_text = extract_text(active_result);
        assert!(active_text.contains("WS Template"));
    }

    #[tokio::test]
    async fn test_cannot_delete_builtin_template() {
        let (handler, _dir) = setup();
        let screen = ai_agent_workspace_core::Screen::default();
        let conn = handler.db.connection().unwrap();
        let layouts = handler.db.layouts(&conn);
        let builtin = layouts.create("General", screen, true).unwrap();
        let result = handler.template_delete(builtin.id.clone()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code.0, -32602);
        assert!(err.message.contains("Built-in") || err.message.contains("built-in"));
    }

    #[tokio::test]
    async fn test_cannot_rename_builtin_template() {
        let (handler, _dir) = setup();
        let screen = ai_agent_workspace_core::Screen::default();
        let conn = handler.db.connection().unwrap();
        let layouts = handler.db.layouts(&conn);
        let builtin = layouts.create("General", screen, true).unwrap();
        let result = handler.template_rename(builtin.id.clone(), "Not General".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code.0, -32602);
        assert!(err.message.contains("Built-in") || err.message.contains("built-in"));
    }

    #[tokio::test]
    async fn test_builtin_shows_in_list() {
        let (handler, _dir) = setup();
        let screen = ai_agent_workspace_core::Screen::default();
        let conn = handler.db.connection().unwrap();
        let layouts = handler.db.layouts(&conn);
        let _builtin = layouts.create("General", screen, true).unwrap();
        let result = handler.template_list().await.unwrap();
        let text = extract_text(result);
        assert!(text.contains("General"));
        assert!(text.contains("built_in"));
        assert!(text.contains("true"));
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
        handler.issue_close(id).await.unwrap();

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
        handler.issue_close(id).await.unwrap();

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
        handler.issue_close(id).await.unwrap();

        let result = handler.issue_summarize_backlog().await.unwrap();
        let text = extract_text(result);
        let summary: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(summary["total"], 3);
        assert_eq!(summary["open"], 2);
        assert_eq!(summary["closed"], 1);
        assert_eq!(summary["by_label"]["needs-triage"], 3);
    }

    // --- Git history & ownership tool tests ---

    fn setup_git_repo() -> (TempDir, String) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap().to_string();
        std::process::Command::new("git")
            .args(["init"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["config", "user.name", "Test Author"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::fs::write(dir.path().join("hello.txt"), "line one\nline two\n").unwrap();
        std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        std::process::Command::new("git")
            .args(["-c", "user.name=Test Author", "-c", "user.email=test@example.com", "commit", "-m", "Initial commit"])
            .current_dir(&path)
            .output()
            .unwrap();
        (dir, path)
    }

    fn setup_handler_with_repo(repo_path: &str) -> (McpHandler, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("workspace.db");
        let db = Database::new(db_path);
        let session_id = {
            let conn = db.connection().unwrap();
            let sessions = db.sessions(&conn);
            let session = sessions.create(repo_path, "Git Test").unwrap();
            session.id
        };
        let handler = McpHandler {
            db,
            on_events: None,
            resolved_session_id: Some(session_id),
            resolution_source: "test".to_string(),
        };
        (handler, dir)
    }

    #[tokio::test]
    async fn test_search_history() {
        let (_repo_dir, repo_path) = setup_git_repo();
        let (handler, _dir) = setup_handler_with_repo(&repo_path);
        let result = handler.search_history(None, None, None, None, None).await.unwrap();
        let text = extract_text(result);
        let commits: serde_json::Value = serde_json::from_str(&text).unwrap();
        let arr = commits.as_array().unwrap();
        assert!(!arr.is_empty());
        assert_eq!(arr[0]["author_name"], "Test Author");
        assert_eq!(arr[0]["message"], "Initial commit");
        assert!(arr[0]["hash"].as_str().unwrap().len() == 40);
    }

    #[tokio::test]
    async fn test_search_history_keyword_filter() {
        let (_repo_dir, repo_path) = setup_git_repo();
        let (handler, _dir) = setup_handler_with_repo(&repo_path);
        let result = handler.search_history(Some("Initial".into()), None, None, None, None).await.unwrap();
        let text = extract_text(result);
        let commits: serde_json::Value = serde_json::from_str(&text).unwrap();
        let arr = commits.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["message"], "Initial commit");
    }

    #[tokio::test]
    async fn test_search_history_no_results() {
        let (_repo_dir, repo_path) = setup_git_repo();
        let (handler, _dir) = setup_handler_with_repo(&repo_path);
        let result = handler.search_history(Some("nonexistent".into()), None, None, None, None).await.unwrap();
        let text = extract_text(result);
        let commits: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(commits.as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_search_history_author_filter() {
        let (_repo_dir, repo_path) = setup_git_repo();
        let (handler, _dir) = setup_handler_with_repo(&repo_path);
        let result = handler.search_history(None, Some("Test Author".into()), None, None, None).await.unwrap();
        let text = extract_text(result);
        let commits: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(commits.as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_blame() {
        let (_repo_dir, repo_path) = setup_git_repo();
        let (handler, _dir) = setup_handler_with_repo(&repo_path);
        let result = handler.blame("hello.txt".into()).await.unwrap();
        let text = extract_text(result);
        let entries: serde_json::Value = serde_json::from_str(&text).unwrap();
        let arr = entries.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["author"], "Test Author");
        assert_eq!(arr[0]["commit_hash"].as_str().unwrap().len(), 40);
        assert_eq!(arr[0]["line_number"], 1);
        assert_eq!(arr[1]["line_number"], 2);
    }

    #[tokio::test]
    async fn test_blame_not_git_repo() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap().to_string();
        let (handler, _handler_dir) = setup_handler_with_repo(&path);
        let result = handler.blame("foo.txt".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("Not a git repository"));
    }

    #[tokio::test]
    async fn test_get_owners_no_file() {
        let (_repo_dir, repo_path) = setup_git_repo();
        let (handler, _dir) = setup_handler_with_repo(&repo_path);
        let result = handler.get_owners(None).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert!(data["file"].is_null());
        assert_eq!(data["rules"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_get_owners_with_file() {
        let (_repo_dir, repo_path) = setup_git_repo();
        std::fs::write(
            std::path::PathBuf::from(&repo_path).join("CODEOWNERS"),
            "# Comments are ignored\n*.rs @rust-team\nsrc/auth/ @auth-team @security-team\n",
        ).unwrap();
        let (handler, _dir) = setup_handler_with_repo(&repo_path);
        let result = handler.get_owners(None).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(data["file"], "CODEOWNERS");
        let rules = data["rules"].as_array().unwrap();
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0]["pattern"], "*.rs");
        assert_eq!(rules[0]["owners"][0], "@rust-team");
        assert_eq!(rules[1]["pattern"], "src/auth/");
    }

    #[tokio::test]
    async fn test_get_owners_filter_by_path() {
        let (_repo_dir, repo_path) = setup_git_repo();
        std::fs::write(
            std::path::PathBuf::from(&repo_path).join("CODEOWNERS"),
            "*.rs @rust-team\n*.ts @frontend-team\n",
        ).unwrap();
        let (handler, _dir) = setup_handler_with_repo(&repo_path);
        let result = handler.get_owners(Some("src/main.rs".into())).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        let rules = data["rules"].as_array().unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0]["pattern"], "*.rs");
    }

    #[tokio::test]
    async fn test_get_owners_not_git_repo() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap().to_string();
        let (handler, _handler_dir) = setup_handler_with_repo(&path);
        let result = handler.get_owners(None).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("Not a git repository"));
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
            nodes_repo.create(&canvas_id, "Existing Node", "", 0.0, 0.0, 100.0, 50.0, None).unwrap().id
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
            handler.db.canvas_nodes(&conn).create(&canvas_id, "Existing", "", 0.0, 0.0, 100.0, 50.0, None).unwrap().id
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
                            DomainEvent::CanvasTagsChanged { session_id, canvas_id } => {
                                let _ = h.emit("canvas-tags-changed", serde_json::json!({
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
