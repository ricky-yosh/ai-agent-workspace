pub mod error;
pub mod session_resolution;

use rmcp::{ServerHandler, tool};
#[cfg(feature = "tauri-integration")]
use rmcp::serve_server;
use rmcp::model::{CallToolResult, Content, ServerInfo, ServerCapabilities};
use ai_agent_workspace_core::database::Database;
use ai_agent_workspace_core::Screen;
use ai_agent_workspace_core::DomainEvent;
use ai_agent_workspace_core::Axis;
use ai_agent_workspace_commands::{AppState, Command, CommandResult, ExecutionOutcome, execute};
#[cfg(feature = "tauri-integration")]
use tauri::{Emitter, Manager};

#[cfg(feature = "tauri-integration")]
fn make_change_callback(handle: &tauri::AppHandle, event: &'static str) -> Option<std::sync::Arc<dyn Fn() + Send + Sync>> {
    let h = handle.clone();
    Some(std::sync::Arc::new(move || { let _ = h.emit(event, ()); }) as std::sync::Arc<dyn Fn() + Send + Sync>)
}

#[cfg(feature = "tauri-integration")]
fn make_workspace_change_callback(handle: &tauri::AppHandle, event: &'static str) -> Option<std::sync::Arc<dyn Fn(String, String, Screen) + Send + Sync>> {
    let h = handle.clone();
    Some(std::sync::Arc::new(move |session_id: String, workspace_id: String, screen: Screen| {
        let _ = h.emit(event, serde_json::json!({ "session_id": session_id, "workspace_id": workspace_id, "screen": screen }));
    }) as std::sync::Arc<dyn Fn(String, String, Screen) + Send + Sync>)
}

#[cfg(feature = "tauri-integration")]
fn make_session_id_callback(handle: &tauri::AppHandle, event: &'static str) -> Option<std::sync::Arc<dyn Fn(String) + Send + Sync>> {
    let h = handle.clone();
    Some(std::sync::Arc::new(move |session_id: String| {
        let _ = h.emit(event, serde_json::json!({ "session_id": session_id }));
    }) as std::sync::Arc<dyn Fn(String) + Send + Sync>)
}

fn invoke_callbacks(
    events: &[DomainEvent],
    session_cb: &Option<std::sync::Arc<dyn Fn() + Send + Sync>>,
    layouts_cb: &Option<std::sync::Arc<dyn Fn() + Send + Sync>>,
    workspace_cb: &Option<std::sync::Arc<dyn Fn(String, String, Screen) + Send + Sync>>,
    issues_cb: &Option<std::sync::Arc<dyn Fn(String) + Send + Sync>>,
) {
    for event in events {
        match event {
            DomainEvent::SessionsChanged => {
                if let Some(cb) = session_cb { cb(); }
            }
            DomainEvent::WorkspaceChanged { session_id, workspace_id, screen } => {
                if let Some(cb) = workspace_cb { cb(session_id.clone(), workspace_id.clone(), screen.clone()); }
            }
            DomainEvent::LayoutsChanged => {
                if let Some(cb) = layouts_cb { cb(); }
            }
            DomainEvent::IssuesChanged { session_id } => {
                if let Some(cb) = issues_cb { cb(session_id.clone()); }
            }
        }
    }
}

macro_rules! run_mcp_command {
    ($cmd:expr, $state:expr, $variant:ident, $bind:ident, json, session_cb: $scb:expr, layouts_cb: $lcb:expr, workspace_cb: $wcb:expr) => {
        match execute($cmd, $state) {
            Ok(ExecutionOutcome { result: CommandResult::$variant($bind), events }) => {
                invoke_callbacks(&events, &$scb, &$lcb, &$wcb, &None::<std::sync::Arc<dyn Fn(String) + Send + Sync>>);
                Ok(CallToolResult::success(vec![Content::json(&$bind)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:ident, json, session_cb: $scb:expr, layouts_cb: $lcb:expr, workspace_cb: $wcb:expr, issues_cb: $icb:expr) => {
        match execute($cmd, $state) {
            Ok(ExecutionOutcome { result: CommandResult::$variant($bind), events }) => {
                invoke_callbacks(&events, &$scb, &$lcb, &$wcb, &$icb);
                Ok(CallToolResult::success(vec![Content::json(&$bind)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:ident, json) => {
        match execute($cmd, $state) {
            Ok(ExecutionOutcome { result: CommandResult::$variant($bind), .. }) => {
                Ok(CallToolResult::success(vec![Content::json(&$bind)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:pat, empty, session_cb: $scb:expr, layouts_cb: $lcb:expr, workspace_cb: $wcb:expr) => {
        match execute($cmd, $state) {
            Ok(ExecutionOutcome { result: CommandResult::$variant($bind), events }) => {
                invoke_callbacks(&events, &$scb, &$lcb, &$wcb, &None::<std::sync::Arc<dyn Fn(String) + Send + Sync>>);
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:pat, empty, session_cb: $scb:expr, layouts_cb: $lcb:expr, workspace_cb: $wcb:expr, issues_cb: $icb:expr) => {
        match execute($cmd, $state) {
            Ok(ExecutionOutcome { result: CommandResult::$variant($bind), events }) => {
                invoke_callbacks(&events, &$scb, &$lcb, &$wcb, &$icb);
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:pat, empty) => {
        match execute($cmd, $state) {
            Ok(ExecutionOutcome { result: CommandResult::$variant($bind), .. }) => {
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:ident, json_or_null) => {
        match execute($cmd, $state) {
            Ok(ExecutionOutcome { result: CommandResult::$variant($bind), .. }) => {
                Ok(CallToolResult::success(vec![Content::json(&$bind)?]))
            }
            Ok(ExecutionOutcome { result: CommandResult::Unit(_), .. }) => {
                Ok(CallToolResult::success(vec![Content::json(&serde_json::Value::Null)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
}

#[derive(Clone)]
pub struct McpHandler {
    pub db: Database,
    pub on_session_changed: Option<std::sync::Arc<dyn Fn() + Send + Sync>>,
    pub on_workspace_changed: Option<std::sync::Arc<dyn Fn(String, String, Screen) + Send + Sync>>,
    pub on_layouts_changed: Option<std::sync::Arc<dyn Fn() + Send + Sync>>,
    pub on_issues_changed: Option<std::sync::Arc<dyn Fn(String) + Send + Sync>>,
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
        issue_summarize_backlog
    });

    #[tool(description = "List all sessions")]
    async fn session_list(&self) -> Result<CallToolResult, rmcp::Error> {
        run_mcp_command!(Command::SessionList, &AppState { db: self.db.clone() }, Sessions, sessions, json)
    }

    #[tool(description = "Create a new session")]
    async fn session_create(&self, #[tool(param)] working_dir: String, #[tool(param)] name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::SessionCreate { working_dir, name }, &state, Session, session, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Rename a session")]
    async fn session_rename(&self, #[tool(param)] session_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::SessionRename { session_id, new_name }, &state, Session, session, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Delete a session")]
    async fn session_delete(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::SessionDelete { session_id }, &state, Unit, _, empty, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Open a session (set as active)")]
    async fn session_open(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::SessionOpen { session_id }, &state, Session, session, json)
    }

    #[tool(description = "Close the active session")]
    async fn session_close(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::SessionClose { session_id }, &state, Session, session, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "List all layout templates")]
    async fn template_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::TemplateList, &state, Layouts, layouts, json)
    }

    #[tool(description = "Save a layout template")]
    async fn template_save(&self, #[tool(param)] name: String, #[tool(param)] screen: Screen) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::TemplateSave { name, screen }, &state, Layout, layout, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Delete a layout template")]
    async fn template_delete(&self, #[tool(param)] layout_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::TemplateDelete { layout_id }, &state, Unit, _, empty, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Rename a layout template")]
    async fn template_rename(&self, #[tool(param)] layout_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::TemplateRename { layout_id, new_name }, &state, Unit, _, empty, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
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
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::WorkspaceList { session_id }, &state, Workspaces, workspaces, json)
    }

    #[tool(description = "Get the active workspace instance, or null when none is active")]
    async fn workspace_get_active(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::WorkspaceGetActive { session_id }, &state, Workspace, ws, json_or_null)
    }

    #[tool(description = "Add a workspace instance from a template")]
    async fn workspace_add(&self, #[tool(param)] template_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::WorkspaceAdd { session_id, template_id }, &state, Workspace, ws, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Remove a workspace instance")]
    async fn workspace_remove(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::WorkspaceRemove { session_id, workspace_id }, &state, Unit, _, empty, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Rename a workspace instance")]
    async fn workspace_rename(&self, #[tool(param)] workspace_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::WorkspaceRename { session_id, workspace_id, new_name }, &state, Unit, _, empty, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Set a workspace as the active workspace")]
    async fn workspace_set_active(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::WorkspaceSetActive { session_id, workspace_id }, &state, Unit, _, empty, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Update the screen of a workspace instance")]
    async fn workspace_update_screen(&self, #[tool(param)] workspace_id: String, #[tool(param)] screen: Screen) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::WorkspaceUpdateScreen { session_id, workspace_id, screen }, &state, Unit, _, empty, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Reset a workspace instance to the template layout")]
    async fn workspace_reset(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::WorkspaceReset { session_id, workspace_id }, &state, Workspace, ws, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Split an area in the workspace screen")]
    async fn split_area(&self, #[tool(param)] workspace_id: String, #[tool(param)] area_id: String, #[tool(param)] axis: Axis, #[tool(param)] factor: f64) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::SplitArea { session_id, workspace_id, area_id, axis, factor }, &state, Workspace, ws, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Join two adjacent areas. source_area_id is absorbed (removed) and target_area_id survives (grows to fill the space).")]
    async fn join_areas(&self, #[tool(param)] workspace_id: String, #[tool(param)] source_area_id: String, #[tool(param)] target_area_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::JoinAreas { session_id, workspace_id, source_area_id, target_area_id }, &state, Workspace, ws, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Close an area in the workspace screen")]
    async fn close_area(&self, #[tool(param)] workspace_id: String, #[tool(param)] area_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::CloseArea { session_id, workspace_id, area_id }, &state, Workspace, ws, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Resize an edge in the workspace screen")]
    async fn resize_edge(&self, #[tool(param)] workspace_id: String, #[tool(param)] edge_id: String, #[tool(param)] position: f64) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::ResizeEdge { session_id, workspace_id, edge_id, position }, &state, Workspace, ws, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Change the panel type of an area in the workspace screen")]
    async fn change_panel_type(&self, #[tool(param)] workspace_id: String, #[tool(param)] area_id: String, #[tool(param)] panel_type: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::ChangePanelType { session_id, workspace_id, area_id, panel_type }, &state, Workspace, ws, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed)
    }

    #[tool(description = "Create an issue in the current session")]
    async fn issue_create(&self, #[tool(param)] title: String, #[tool(param)] body: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueCreate { session_id, title, body }, &state, Issue, issue, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed, issues_cb: self.on_issues_changed)
    }

    #[tool(description = "List all issues in the current session")]
    async fn issue_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueList { session_id }, &state, Issues, issues, json)
    }

    #[tool(description = "Get an issue by ID")]
    async fn issue_get(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let _session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueGet { id }, &state, Issue, issue, json)
    }

    #[tool(description = "Update an issue's title, body, labels, or state")]
    async fn issue_update(&self, #[tool(param)] id: String, #[tool(param)] title: Option<String>, #[tool(param)] body: Option<String>, #[tool(param)] labels: Option<Vec<String>>, #[tool(param)] state: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let _session_id = self.require_session_id()?;
        let state_arg = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueUpdate { id, title, body, labels, state }, &state_arg, Issue, issue, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed, issues_cb: self.on_issues_changed)
    }

    #[tool(description = "Close an issue")]
    async fn issue_close(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let _session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueClose { id }, &state, Issue, issue, json, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed, issues_cb: self.on_issues_changed)
    }

    #[tool(description = "Delete an issue")]
    async fn issue_delete(&self, #[tool(param)] id: String) -> Result<CallToolResult, rmcp::Error> {
        let _session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueDelete { id }, &state, Unit, _, empty, session_cb: self.on_session_changed, layouts_cb: self.on_layouts_changed, workspace_cb: self.on_workspace_changed, issues_cb: self.on_issues_changed)
    }

    #[tool(description = "Search issues in the current session by state, label, and/or keyword")]
    async fn issue_search(&self, #[tool(param)] state: Option<String>, #[tool(param)] label: Option<String>, #[tool(param)] keyword: Option<String>) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state_arg = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueSearch { session_id, state, label, keyword }, &state_arg, Issues, issues, json)
    }

    #[tool(description = "Get the next open issue to work on, prioritized by triage label, or null if none")]
    async fn issue_get_next(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueGetNext { session_id }, &state, Issue, issue, json_or_null)
    }

    #[tool(description = "Summarize the issue backlog: total, open, closed, and counts by label")]
    async fn issue_summarize_backlog(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { db: self.db.clone() };
        run_mcp_command!(Command::IssueSummarizeBacklog { session_id }, &state, IssueBacklogSummary, summary, json)
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
            on_session_changed: None,
            on_workspace_changed: None,
            on_layouts_changed: None,
            on_issues_changed: None,
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
        let conn = handler.db.connection().unwrap();
        let sessions = handler.db.sessions(&conn);
        let session = sessions.create("/tmp/test", "Test Session").unwrap();
        handler.resolved_session_id = Some(session.id);
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
}

#[cfg(feature = "tauri-integration")]
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("mcp")
        .setup(|app, _config| {
            let state = app.state::<AppState>();
            let db = state.db.clone();
            let handle = app.app_handle().clone();

            let on_session_changed = make_change_callback(&handle, "sessions-changed");
            let on_workspace_changed = make_workspace_change_callback(&handle, "workspace-changed");
            let on_layouts_changed = make_change_callback(&handle, "layouts-changed");
            let on_issues_changed = make_session_id_callback(&handle, "issues-changed");

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new()
                    .expect("failed to create tokio runtime for MCP server");
                rt.block_on(async {
                    let handler = McpHandler {
                        db,
                        on_session_changed,
                        on_workspace_changed,
                        on_layouts_changed,
                        on_issues_changed,
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
