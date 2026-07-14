pub mod error;
pub mod session_resolution;

use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use rmcp::{ServerHandler, tool};
#[cfg(feature = "tauri-integration")]
use rmcp::serve_server;
use rmcp::model::{CallToolResult, Content, ServerInfo, ServerCapabilities};
use ai_agent_workspace_core::database::{Database, CachedConnection};
use ai_agent_workspace_core::Screen;
use ai_agent_workspace_core::DomainEvent;
use ai_agent_workspace_core::Axis;
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
        index_cancel_flag: Arc::new(AtomicBool::new(false)),
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
    pub on_open_file_request: Option<Arc<dyn Fn(String, String) + Send + Sync>>,
    pub on_show_diff_request: Option<Arc<dyn Fn(String, Option<String>, bool) + Send + Sync>>,
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
        current_session_info,
        session_list,
        session_create,
        session_rename,
        session_delete,
        session_open,
        session_close,
        template_list,
        template_save,
        template_delete,
        template_rename,
        workspace_list,
        workspace_get_active,
        workspace_add,
        workspace_remove,
        workspace_rename,
        workspace_set_active,
        workspace_update_screen,
        workspace_reset,
        split_area,
        join_areas,
        close_area,
        resize_edge,
        change_panel_type,
        issue_create,
        issue_list,
        issue_get,
        issue_update,
        issue_close,
        issue_delete,
        issue_search,
        issue_get_next,
        issue_summarize_backlog,
        open_file,
        show_diff,
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
        tag_add,
        tag_remove,
        tag_list,
        c4_diagram_create,
        c4_diagram_list,
        c4_diagram_get,
        c4_diagram_delete,
        c4_diagram_rename,
        keyword_search,
        find_definition,
        find_references,
        find_callers,
        find_callees,
        list_code_files,
        read_file_range,
        generate_c4_diagram,
        search_history,
        blame,
        get_owners
    });

    #[tool(description = "List all sessions")]
    async fn session_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::SessionList, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Create a new session")]
    async fn session_create(&self, #[tool(param)] working_dir: String, #[tool(param)] name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::SessionCreate { working_dir, name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Rename a session")]
    async fn session_rename(&self, #[tool(param)] session_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::SessionRename { session_id, new_name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a session")]
    async fn session_delete(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::SessionDelete { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "Open a session (set as active)")]
    async fn session_open(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::SessionOpen { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Close the active session")]
    async fn session_close(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::SessionClose { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "List all layout templates")]
    async fn template_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::TemplateList, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Save a layout template")]
    async fn template_save(&self, #[tool(param)] name: String, #[tool(param)] screen: Screen) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::TemplateSave { name, screen }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a layout template")]
    async fn template_delete(&self, #[tool(param)] layout_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::TemplateDelete { layout_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "Rename a layout template")]
    async fn template_rename(&self, #[tool(param)] layout_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::TemplateRename { layout_id, new_name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

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

    fn resolve_index_store(&self) -> Result<(String, CachedConnection<'_>), rmcp::Error> {
        let session_id = self.require_session_id()?;
        let repo_path = self.db.get_working_directory(&session_id).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let conn = self.db.connection().map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        ai_agent_workspace_code_intelligence::ensure_indexed(&conn, &repo_path).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok((repo_path, conn))
    }

    #[tool(description = "Show the current session info including ID, name, working directory, and how it was resolved")]
    async fn current_session_info(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let conn = self.db.connection().map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let sessions = self.db.sessions(&conn);
        let session = sessions.get(&session_id)
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let info = serde_json::json!({
            "session_id": session.id,
            "name": session.name,
            "working_directory": session.working_directory,
            "source": self.resolution_source,
        });
        Ok(CallToolResult::success(vec![Content::json(&info)?]))
    }

    #[tool(description = "List workspace instances for the current session")]
    async fn workspace_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::WorkspaceList { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Get the active workspace instance, or null when none is active")]
    async fn workspace_get_active(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::WorkspaceGetActive { session_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::JsonOrNull)
    }

    #[tool(description = "Add a workspace instance from a template")]
    async fn workspace_add(&self, #[tool(param)] template_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::WorkspaceAdd { session_id, template_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Remove a workspace instance")]
    async fn workspace_remove(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::WorkspaceRemove { session_id, workspace_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "Rename a workspace instance")]
    async fn workspace_rename(&self, #[tool(param)] workspace_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::WorkspaceRename { session_id, workspace_id, new_name }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "Set a workspace as the active workspace")]
    async fn workspace_set_active(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::WorkspaceSetActive { session_id, workspace_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "Update the screen of a workspace instance")]
    async fn workspace_update_screen(&self, #[tool(param)] workspace_id: String, #[tool(param)] screen: Screen) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::WorkspaceUpdateScreen { session_id, workspace_id, screen }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
    }

    #[tool(description = "Reset a workspace instance to the template layout")]
    async fn workspace_reset(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::WorkspaceReset { session_id, workspace_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Split an area in the workspace screen")]
    async fn split_area(&self, #[tool(param)] workspace_id: String, #[tool(param)] area_id: String, #[tool(param)] axis: Axis, #[tool(param)] factor: f64, #[tool(param)] new_panel_type: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::SplitArea { session_id, workspace_id, area_id, axis, factor, new_panel_type }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Join two adjacent areas. source_area_id is absorbed (removed) and target_area_id survives (grows to fill the space).")]
    async fn join_areas(&self, #[tool(param)] workspace_id: String, #[tool(param)] source_area_id: String, #[tool(param)] target_area_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::JoinAreas { session_id, workspace_id, source_area_id, target_area_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Close an area in the workspace screen")]
    async fn close_area(&self, #[tool(param)] workspace_id: String, #[tool(param)] area_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CloseArea { session_id, workspace_id, area_id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Resize an edge in the workspace screen")]
    async fn resize_edge(&self, #[tool(param)] workspace_id: String, #[tool(param)] edge_id: String, #[tool(param)] position: f64) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::ResizeEdge { session_id, workspace_id, edge_id, position }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Change the panel type of an area in the workspace screen")]
    async fn change_panel_type(&self, #[tool(param)] workspace_id: String, #[tool(param)] area_id: String, #[tool(param)] panel_type: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::ChangePanelType { session_id, workspace_id, area_id, panel_type }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
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

    #[tool(description = "Create a node on a visual canvas with content, position, and optional metadata")]
    async fn node_create(&self, #[tool(param)] canvas_id: String, #[tool(param)] content: String, #[tool(param)] x: f64, #[tool(param)] y: f64, #[tool(param)] width: Option<f64>, #[tool(param)] height: Option<f64>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        let w = width.unwrap_or(200.0);
        let h = height.unwrap_or(100.0);
        respond(&state, execute(Command::CanvasNodeCreate { canvas_id, content, x, y, width: w, height: h, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
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

    #[tool(description = "Update a canvas node's content, position, size, or metadata")]
    async fn node_update(&self, #[tool(param)] id: String, #[tool(param)] content: Option<String>, #[tool(param)] x: Option<f64>, #[tool(param)] y: Option<f64>, #[tool(param)] width: Option<f64>, #[tool(param)] height: Option<f64>, #[tool(param)] metadata_json: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeUpdate { id, content, x, y, width, height, metadata_json }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Json)
    }

    #[tool(description = "Delete a canvas node. Cascades to remove connected edges and remove the node from any groups.")]
    async fn node_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = McpState { db: self.db.clone(), on_events: self.on_events.clone() };
        respond(&state, execute(Command::CanvasNodeDelete { id }, &mcp_app_state(&state)).map_err(|e| crate::error::to_mcp_error(e))?, ResponseFormat::Empty)
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

    #[tool(description = "Create a C4 diagram for a repository")]
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

    #[tool(description = "Open a file in the File Viewer Panel. Emits an event that the frontend handles by opening the file in the last-focused viewer (or creating one if none exists).")]
    async fn open_file(&self, #[tool(param)] file_path: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        if let Some(ref cb) = self.on_open_file_request {
            cb(session_id.clone(), file_path.clone());
        }
        Ok(CallToolResult::success(vec![Content::json(&serde_json::json!({
            "success": true,
            "file_path": file_path,
        }))?]))
    }

    #[tool(description = "Show a diff in the Diff Viewer Panel. Emits an event that the frontend handles by opening the diff in the last-focused viewer (or creating one if none exists). Optionally filter by file_path and/or show staged changes.")]
    async fn show_diff(&self, #[tool(param)] file_path: Option<String>, #[tool(param)] staged: Option<bool>) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let staged_val = staged.unwrap_or(false);
        if let Some(ref cb) = self.on_show_diff_request {
            cb(session_id.clone(), file_path.clone(), staged_val);
        }
        Ok(CallToolResult::success(vec![Content::json(&serde_json::json!({
            "success": true,
            "file_path": file_path,
            "staged": staged_val,
        }))?]))
    }

    #[tool(description = "Search indexed code by keyword or regex pattern")]
    async fn keyword_search(&self, #[tool(param)] query: String, #[tool(param)] regex: Option<bool>) -> Result<CallToolResult, rmcp::Error> {
        let (repo_path, conn) = self.resolve_index_store()?;
        let store = ai_agent_workspace_code_intelligence::IndexStore::new(&conn);
        let results = if regex.unwrap_or(false) {
            store.search_by_regex(&repo_path, &query)
        } else {
            store.search_by_keyword(&repo_path, &query)
        }.map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&results)?]))
    }

    #[tool(description = "Find the definition of a symbol by name in the indexed codebase")]
    async fn find_definition(&self, #[tool(param)] symbol_name: String) -> Result<CallToolResult, rmcp::Error> {
        let (repo_path, conn) = self.resolve_index_store()?;
        let store = ai_agent_workspace_code_intelligence::IndexStore::new(&conn);
        let results = store.find_definition(&repo_path, &symbol_name).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&results)?]))
    }

    #[tool(description = "Find all references/usage of a symbol in the indexed codebase")]
    async fn find_references(&self, #[tool(param)] symbol_name: String) -> Result<CallToolResult, rmcp::Error> {
        let (repo_path, conn) = self.resolve_index_store()?;
        let store = ai_agent_workspace_code_intelligence::IndexStore::new(&conn);
        let results = store.find_references(&repo_path, &symbol_name).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&results)?]))
    }

    #[tool(description = "Find all callers of a function (call sites)")]
    async fn find_callers(&self, #[tool(param)] symbol_name: String) -> Result<CallToolResult, rmcp::Error> {
        let (repo_path, conn) = self.resolve_index_store()?;
        let store = ai_agent_workspace_code_intelligence::IndexStore::new(&conn);
        let results = store.find_callers(&repo_path, &symbol_name).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&results)?]))
    }

    #[tool(description = "Find what functions are called by a given function in a file (callees)")]
    async fn find_callees(&self, #[tool(param)] file_path: String, #[tool(param)] symbol_name: String) -> Result<CallToolResult, rmcp::Error> {
        let (repo_path, conn) = self.resolve_index_store()?;
        let store = ai_agent_workspace_code_intelligence::IndexStore::new(&conn);
        let results = store.find_callees(&repo_path, &file_path, &symbol_name).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&results)?]))
    }

    #[tool(description = "List all indexed source files in the repository")]
    async fn list_code_files(&self) -> Result<CallToolResult, rmcp::Error> {
        let (repo_path, conn) = self.resolve_index_store()?;
        let store = ai_agent_workspace_code_intelligence::IndexStore::new(&conn);
        let results = store.list_files(&repo_path).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::json(&results)?]))
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

    #[tool(description = "Generate a C4 architecture diagram from the code intelligence index. Returns structural data for the AI to interpret and label. Use c4_diagram_create to persist the result.")]
    async fn generate_c4_diagram(
        &self,
        #[tool(param)] scope: Option<String>,
        #[tool(param)] max_depth: Option<u32>,
    ) -> Result<CallToolResult, rmcp::Error> {
        let (repo_path, conn) = self.resolve_index_store()?;
        let store = ai_agent_workspace_code_intelligence::IndexStore::new(&conn);
        let depth = max_depth.unwrap_or(3).min(4).max(1);
        let scope_ref = scope.as_deref();
        let entries = store.list_all_entries(&repo_path, scope_ref).map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        if entries.is_empty() {
            return Ok(CallToolResult::success(vec![Content::text(
                "No code index found for this repository. The index will be built automatically on first use. Please try again."
            )]));
        }
        let result = build_c4_structure(&repo_path, scope_ref, depth, &entries);
        Ok(CallToolResult::success(vec![Content::json(&result)?]))
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

fn build_c4_structure(
    repo_path: &str,
    scope: Option<&str>,
    max_depth: u32,
    entries: &[ai_agent_workspace_code_intelligence::IndexEntry],
) -> serde_json::Value {
    use std::collections::{HashMap, HashSet};

    let root_dir = std::path::Path::new(repo_path);
    let scope_prefix = scope.unwrap_or("").trim_end_matches('/');

    let mut dir_symbols: HashMap<String, Vec<&ai_agent_workspace_code_intelligence::IndexEntry>> = HashMap::new();
    let mut all_dirs: HashSet<String> = HashSet::new();
    let mut file_dirs: HashMap<String, String> = HashMap::new();

    for entry in entries {
        let rel_path = if scope_prefix.is_empty() {
            entry.file_path.clone()
        } else {
            entry.file_path.strip_prefix(scope_prefix)
                .unwrap_or(&entry.file_path)
                .trim_start_matches('/')
                .to_string()
        };

        let components: Vec<&str> = rel_path.split('/').collect();
        let dir = if components.len() > 1 {
            components[..components.len()-1].join("/")
        } else {
            ".".to_string()
        };

        let dir_depth = dir.chars().filter(|&c| c == '/').count() as u32 + 1;
        if dir_depth < max_depth {
            all_dirs.insert(dir.clone());
        }
        dir_symbols.entry(dir.clone()).or_default().push(entry);
        file_dirs.insert(entry.file_path.clone(), dir);
    }

    let mut nodes: Vec<serde_json::Value> = Vec::new();
    let mut edges: Vec<serde_json::Value> = Vec::new();
    let mut groups: Vec<serde_json::Value> = Vec::new();
    let mut node_ids: HashMap<String, String> = HashMap::new();

    let system_label = scope.map(|s| s.to_string()).unwrap_or_else(|| {
        root_dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "system".to_string())
    });

    let system_id = uuid::Uuid::new_v4().to_string();
    nodes.push(serde_json::json!({
        "id": system_id,
        "label": system_label,
        "level": "context",
        "type": "system",
        "file_path": scope.unwrap_or(""),
        "children_count": all_dirs.len(),
        "code_snippet": null,
        "metadata": { "total_symbols": entries.len() }
    }));
    node_ids.insert(".".to_string(), system_id.clone());

    let mut sorted_dirs: Vec<String> = all_dirs.into_iter().collect();
    sorted_dirs.sort();

    for dir in &sorted_dirs {
        let dir_depth = dir.chars().filter(|&c| c == '/').count() as u32 + 1;
        let level = if dir_depth == 1 {
            "container"
        } else {
            "component"
        };

        let dir_display = if dir == "." {
            system_label.clone()
        } else {
            dir.clone()
        };

        let child_count = dir_symbols.get(dir).map(|v| v.len()).unwrap_or(0);
        let dir_id = uuid::Uuid::new_v4().to_string();

        let file_count = {
            let mut files: HashSet<&str> = HashSet::new();
            if let Some(syms) = dir_symbols.get(dir) {
                for s in syms {
                    files.insert(&s.file_path);
                }
            }
            files.len()
        };

        nodes.push(serde_json::json!({
            "id": dir_id,
            "label": dir_display,
            "level": level,
            "type": "module",
            "file_path": if dir == "." { "".to_string() } else { format!("{}/", dir) },
            "children_count": child_count,
            "code_snippet": null,
            "metadata": { "file_count": file_count, "symbol_count": child_count }
        }));
        node_ids.insert(dir.clone(), dir_id.clone());

        if let Some(parent_dir) = {
            if dir == "." {
                None
            } else {
                let path = std::path::Path::new(dir);
                path.parent().map(|p| {
                    let s = p.to_string_lossy().to_string();
                    if s.is_empty() { ".".to_string() } else { s }
                })
            }
        } {
            if let Some(parent_id) = node_ids.get(&parent_dir) {
                groups.push(serde_json::json!({
                    "id": uuid::Uuid::new_v4().to_string(),
                    "label": parent_dir.clone(),
                    "level": if parent_dir == "." { "context" } else { "container" },
                    "node_ids": [dir_id.clone()]
                }));
                edges.push(serde_json::json!({
                    "source_id": parent_id,
                    "target_id": dir_id,
                    "label": "contains",
                    "type": "composition"
                }));
            }
        }
    }

    if max_depth >= 4 {
        for entry in entries {
            let kind = entry.data_json.as_ref()
                .and_then(|d| serde_json::from_str::<serde_json::Value>(d).ok())
                .and_then(|d| d.get("kind").and_then(|k| k.as_str()).map(|s| s.to_string()))
                .unwrap_or_else(|| entry.symbol_type.clone());

            let code_snippet = if entry.symbol_type == "definition" {
                let full = root_dir.join(&entry.file_path);
                if let Ok(content) = std::fs::read_to_string(&full) {
                    let lines: Vec<&str> = content.lines().collect();
                    let start = (entry.line_number as usize).saturating_sub(1);
                    let end = entry.end_line_number.map(|l| l as usize).unwrap_or(start + 1).min(lines.len());
                    if start < lines.len() {
                        Some(lines[start..end].join("\n"))
                    } else { None }
                } else { None }
            } else {
                None
            };

            let sym_id = uuid::Uuid::new_v4().to_string();

            let mut metadata = serde_json::json!({});
            if entry.symbol_type == "definition" {
                let calls: Vec<&str> = entries.iter()
                    .filter(|e| e.symbol_type == "call" && e.file_path == entry.file_path && e.line_number > entry.line_number)
                    .take(20)
                    .map(|e| e.symbol_name.as_str())
                    .collect();
                if !calls.is_empty() {
                    metadata["calls"] = serde_json::json!(calls);
                }
            }

            nodes.push(serde_json::json!({
                "id": sym_id,
                "label": entry.symbol_name,
                "level": "code",
                "type": kind,
                "file_path": entry.file_path,
                "line_start": entry.line_number,
                "line_end": entry.end_line_number,
                "code_snippet": code_snippet,
                "metadata": metadata
            }));
        }
    }

    let definitions_by_name: HashMap<&str, &str> = entries.iter()
        .filter(|e| e.symbol_type == "definition")
        .map(|e| (e.symbol_name.as_str(), e.file_path.as_str()))
        .collect();

    let file_stems: HashMap<String, &str> = entries.iter()
        .map(|e| {
            let stem = std::path::Path::new(&e.file_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            (stem, e.file_path.as_str())
        })
        .collect();

    for entry in entries {
        if entry.symbol_type == "import" {
            let source_file_dir = file_dirs.get(&entry.file_path)
                .cloned()
                .unwrap_or_else(|| ".".to_string());

            if let Some(source_id) = node_ids.get(&source_file_dir) {
                let imported_name = &entry.symbol_name;

                let target_file = definitions_by_name.get(imported_name.as_str()).copied()
                    .or_else(|| file_stems.get(imported_name.as_str()).copied());

                if let Some(tf) = target_file {
                    let target_dir = file_dirs.get(tf)
                        .cloned()
                        .unwrap_or_else(|| ".".to_string());
                    if let Some(target_id) = node_ids.get(&target_dir) {
                        if source_id != target_id {
                            edges.push(serde_json::json!({
                                "source_id": source_id,
                                "target_id": target_id,
                                "label": entry.symbol_name,
                                "type": "dependency"
                            }));
                        }
                    }
                }
            }
        }
    }

    serde_json::json!({
        "repo_path": repo_path,
        "scope": scope,
        "max_depth": max_depth,
        "nodes": nodes,
        "edges": edges,
        "groups": groups,
        "instructions": "This is a raw structural map of the codebase. Please interpret the components, assign meaningful labels, and classify each node into the appropriate C4 level (context, container, component, code). Then call c4_diagram_create to persist the diagram."
    })
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
            on_open_file_request: None,
            on_show_diff_request: None,
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
            on_open_file_request: None,
            on_show_diff_request: None,
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

    #[tokio::test]
    async fn test_generate_c4_diagram_basic() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_str().unwrap().to_string();
        std::fs::create_dir_all(dir.path().join("src/auth")).unwrap();
        std::fs::write(
            dir.path().join("src/auth/login.rs"),
            "fn authenticate(user: &str) -> bool { verify(user) }\nfn verify(s: &str) -> bool { true }\n",
        ).unwrap();
        std::fs::write(
            dir.path().join("src/main.rs"),
            "use crate::auth::login;\nfn main() { login::authenticate(\"test\"); }\n",
        ).unwrap();
        let (handler, _handler_dir) = setup_handler_with_repo(&repo_path);
        let result = handler.generate_c4_diagram(None, None).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(data["repo_path"], repo_path);
        assert_eq!(data["max_depth"], 3);
        let nodes = data["nodes"].as_array().unwrap();
        assert!(!nodes.is_empty());
        let has_context = nodes.iter().any(|n| n["level"] == "context");
        assert!(has_context, "should have a context-level node");
        let has_container = nodes.iter().any(|n| n["level"] == "container");
        assert!(has_container, "should have container-level nodes");
        assert!(data["instructions"].as_str().unwrap().contains("c4_diagram_create"));
    }

    #[tokio::test]
    async fn test_generate_c4_diagram_scope_filtering() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_str().unwrap().to_string();
        std::fs::create_dir_all(dir.path().join("src/auth")).unwrap();
        std::fs::create_dir_all(dir.path().join("src/api")).unwrap();
        std::fs::write(
            dir.path().join("src/auth/login.rs"),
            "fn authenticate() {}\n",
        ).unwrap();
        std::fs::write(
            dir.path().join("src/api/handler.rs"),
            "fn handle_request() {}\n",
        ).unwrap();
        let (handler, _handler_dir) = setup_handler_with_repo(&repo_path);
        let result = handler.generate_c4_diagram(Some("src/auth".into()), None).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(data["scope"], "src/auth");
        let nodes = data["nodes"].as_array().unwrap();
        let code_nodes: Vec<&serde_json::Value> = nodes.iter()
            .filter(|n| n["level"] == "code")
            .collect();
        for node in &code_nodes {
            let fp = node["file_path"].as_str().unwrap();
            assert!(fp.starts_with("src/auth"), "expected scoped file, got: {}", fp);
        }
    }

    #[tokio::test]
    async fn test_generate_c4_diagram_max_depth() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_str().unwrap().to_string();
        std::fs::create_dir_all(dir.path().join("src/deep/nested")).unwrap();
        std::fs::write(
            dir.path().join("src/deep/nested/module.rs"),
            "fn deep_fn() {}\n",
        ).unwrap();
        let (handler, _handler_dir) = setup_handler_with_repo(&repo_path);
        let result = handler.generate_c4_diagram(None, Some(2)).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(data["max_depth"], 2);
        let nodes = data["nodes"].as_array().unwrap();
        let levels: Vec<&str> = nodes.iter().filter_map(|n| n["level"].as_str()).collect();
        assert!(!levels.contains(&"code"), "max_depth=2 should not produce code-level nodes");
    }

    #[tokio::test]
    async fn test_generate_c4_diagram_max_depth_4() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_str().unwrap().to_string();
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(
            dir.path().join("src/main.rs"),
            "fn main() {}\nfn helper() {}\n",
        ).unwrap();
        let (handler, _handler_dir) = setup_handler_with_repo(&repo_path);
        let result = handler.generate_c4_diagram(None, Some(4)).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(data["max_depth"], 4);
        let nodes = data["nodes"].as_array().unwrap();
        let has_code = nodes.iter().any(|n| n["level"] == "code");
        assert!(has_code, "max_depth=4 should produce code-level nodes");
    }

    #[tokio::test]
    async fn test_generate_c4_diagram_edges() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_str().unwrap().to_string();
        std::fs::create_dir_all(dir.path().join("src/auth")).unwrap();
        std::fs::create_dir_all(dir.path().join("src/api")).unwrap();
        std::fs::write(
            dir.path().join("src/auth/login.rs"),
            "pub fn authenticate(user: &str) -> bool { true }\n",
        ).unwrap();
        std::fs::write(
            dir.path().join("src/api/handler.rs"),
            "use crate::auth::login;\nfn handle_request() { login::authenticate(\"test\"); }\n",
        ).unwrap();
        let (handler, _handler_dir) = setup_handler_with_repo(&repo_path);
        let result = handler.generate_c4_diagram(None, None).await.unwrap();
        let text = extract_text(result);
        let data: serde_json::Value = serde_json::from_str(&text).unwrap();
        let edges = data["edges"].as_array().unwrap();
        let non_composition: Vec<&serde_json::Value> = edges.iter()
            .filter(|e| e["type"] != "composition")
            .collect();
        assert!(!non_composition.is_empty(), "should have non-composition edges from imports/calls");
    }

    #[tokio::test]
    async fn test_generate_c4_diagram_empty_index() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_str().unwrap().to_string();
        let (handler, _handler_dir) = setup_handler_with_repo(&repo_path);
        let result = handler.generate_c4_diagram(None, None).await.unwrap();
        let text = extract_text(result);
        assert!(text.contains("No code index found") || text.contains("instructions"));
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
                            DomainEvent::C4DiagramsChanged { repo_path: _ } => {
                                let _ = h.emit("c4-diagrams-changed", ());
                            }
                        }
                    }
                }) as Arc<dyn Fn(&[DomainEvent]) + Send + Sync>)
            };

            let on_open_file_request = {
                let h = handle.clone();
                Some(Arc::new(move |session_id: String, file_path: String| {
                    let _ = h.emit("open-file-request", serde_json::json!({
                        "session_id": session_id,
                        "file_path": file_path,
                    }));
                }) as Arc<dyn Fn(String, String) + Send + Sync>)
            };

            let on_show_diff_request = {
                let h = handle.clone();
                Some(Arc::new(move |session_id: String, file_path: Option<String>, staged: bool| {
                    let _ = h.emit("show-diff-request", serde_json::json!({
                        "session_id": session_id,
                        "file_path": file_path,
                        "staged": staged,
                    }));
                }) as Arc<dyn Fn(String, Option<String>, bool) + Send + Sync>)
            };

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new()
                    .expect("failed to create tokio runtime for MCP server");
                rt.block_on(async {
                    let handler = McpHandler {
                        db,
                        on_events,
                        on_open_file_request,
                        on_show_diff_request,
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
