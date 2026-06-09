pub mod error;

use std::sync::{Arc, Mutex};
use rmcp::{ServerHandler, serve_server, tool};
use rmcp::model::{CallToolResult, Content, ServerInfo};
use ai_agent_workspace_core::{SessionRegistry, LayoutStore, LayoutTree};
use ai_agent_workspace_commands::{AppState, Command, CommandResult, execute};
use serde_json;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone)]
#[allow(dead_code)]
struct McpHandler {
    sessions: Arc<Mutex<SessionRegistry>>,
    layouts: Arc<Mutex<LayoutStore>>,
    app: AppHandle,
}

impl ServerHandler for McpHandler {
    rmcp::tool_box!(@derive);

    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some("AI Agent Workspace MCP Server".into()),
            ..Default::default()
        }
    }
}

impl McpHandler {
    rmcp::tool_box!(McpHandler {
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
        workspace_update_tree,
        workspace_reset
    });

    #[tool(description = "List all sessions")]
    async fn session_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::SessionList, &state) {
            Ok(CommandResult::Sessions(sessions)) => {
                Ok(CallToolResult::success(vec![Content::json(&sessions)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Create a new session")]
    async fn session_create(
        &self,
        #[tool(param)]
        working_dir: String,
        #[tool(param)]
        name: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::SessionCreate { working_dir, name }, &state) {
            Ok(CommandResult::Session(session)) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![Content::json(&session)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Rename a session")]
    async fn session_rename(
        &self,
        #[tool(param)]
        session_id: String,
        #[tool(param)]
        new_name: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::SessionRename { session_id, new_name }, &state) {
            Ok(CommandResult::Session(session)) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![Content::json(&session)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Delete a session")]
    async fn session_delete(
        &self,
        #[tool(param)]
        session_id: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::SessionDelete { session_id }, &state) {
            Ok(CommandResult::Unit(())) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Open a session (set as active)")]
    async fn session_open(
        &self,
        #[tool(param)]
        session_id: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::SessionOpen { session_id }, &state) {
            Ok(CommandResult::Session(session)) => {
                Ok(CallToolResult::success(vec![Content::json(&session)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Close the active session")]
    async fn session_close(
        &self,
        #[tool(param)]
        session_id: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::SessionClose { session_id }, &state) {
            Ok(CommandResult::Session(session)) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![Content::json(&session)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "List all layout templates")]
    async fn template_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::TemplateList, &state) {
            Ok(CommandResult::Layouts(layouts)) => {
                Ok(CallToolResult::success(vec![Content::json(&layouts)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Save a layout template")]
    async fn template_save(
        &self,
        #[tool(param)]
        name: String,
        #[tool(param)]
        tree: LayoutTree,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::TemplateSave { name, tree }, &state) {
            Ok(CommandResult::Layout(layout)) => {
                let _ = self.app.emit("layouts-changed", ());
                Ok(CallToolResult::success(vec![Content::json(&layout)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Delete a layout template")]
    async fn template_delete(
        &self,
        #[tool(param)]
        layout_id: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::TemplateDelete { layout_id }, &state) {
            Ok(CommandResult::Unit(())) => {
                let _ = self.app.emit("layouts-changed", ());
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Rename a layout template")]
    async fn template_rename(
        &self,
        #[tool(param)]
        layout_id: String,
        #[tool(param)]
        new_name: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState {
            sessions: self.sessions.clone(),
            layouts: self.layouts.clone(),
        };
        match execute(Command::TemplateRename { layout_id, new_name }, &state) {
            Ok(CommandResult::Unit(())) => {
                let _ = self.app.emit("layouts-changed", ());
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    fn require_session_id() -> Result<String, rmcp::Error> {
        std::env::var("AIAW_SESSION_ID")
            .map_err(|_| rmcp::Error::invalid_params("AIAW_SESSION_ID environment variable is not set. Workspace tools require a session context.", None))
    }

    #[tool(description = "List workspace instances for the current session")]
    async fn workspace_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = Self::require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        match execute(Command::WorkspaceList { session_id }, &state) {
            Ok(CommandResult::Workspaces(workspaces)) =>
                Ok(CallToolResult::success(vec![Content::json(&workspaces)?])),
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Get the active workspace instance, or null when none is active")]
    async fn workspace_get_active(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = Self::require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        match execute(Command::WorkspaceGetActive { session_id }, &state) {
            Ok(CommandResult::Workspace(ws)) =>
                Ok(CallToolResult::success(vec![Content::json(&ws)?])),
            Ok(CommandResult::Unit(())) =>
                Ok(CallToolResult::success(vec![Content::json(&serde_json::Value::Null)?])),
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Add a workspace instance from a template")]
    async fn workspace_add(
        &self,
        #[tool(param)]
        template_id: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = Self::require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        match execute(Command::WorkspaceAdd { session_id, template_id }, &state) {
            Ok(CommandResult::Workspace(ws)) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![Content::json(&ws)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Remove a workspace instance")]
    async fn workspace_remove(
        &self,
        #[tool(param)]
        workspace_id: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = Self::require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        match execute(Command::WorkspaceRemove { session_id, workspace_id }, &state) {
            Ok(CommandResult::Unit(())) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Rename a workspace instance")]
    async fn workspace_rename(
        &self,
        #[tool(param)]
        workspace_id: String,
        #[tool(param)]
        new_name: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = Self::require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        match execute(Command::WorkspaceRename { session_id, workspace_id, new_name }, &state) {
            Ok(CommandResult::Unit(())) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Set a workspace as the active workspace")]
    async fn workspace_set_active(
        &self,
        #[tool(param)]
        workspace_id: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = Self::require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        match execute(Command::WorkspaceSetActive { session_id, workspace_id }, &state) {
            Ok(CommandResult::Unit(())) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Update the layout tree of a workspace instance")]
    async fn workspace_update_tree(
        &self,
        #[tool(param)]
        workspace_id: String,
        #[tool(param)]
        tree: LayoutTree,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = Self::require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        match execute(Command::WorkspaceUpdateTree { session_id, workspace_id, tree }, &state) {
            Ok(CommandResult::Unit(())) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }

    #[tool(description = "Reset a workspace instance to the template layout")]
    async fn workspace_reset(
        &self,
        #[tool(param)]
        workspace_id: String,
    ) -> Result<CallToolResult, rmcp::Error> {
        let session_id = Self::require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        match execute(Command::WorkspaceReset { session_id, workspace_id }, &state) {
            Ok(CommandResult::Workspace(ws)) => {
                let _ = self.app.emit("sessions-changed", ());
                Ok(CallToolResult::success(vec![Content::json(&ws)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    }
}

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("mcp")
        .setup(|app, _config| {
            let state = app.state::<AppState>();
            let sessions = state.sessions.clone();
            let layouts = state.layouts.clone();
            let handle = app.app_handle().clone();

            tokio::spawn(async move {
                let handler = McpHandler {
                    sessions,
                    layouts,
                    app: handle,
                };
                if let Err(e) = serve_server(handler, rmcp::transport::io::stdio()).await {
                    eprintln!("[mcp] Server error: {}", e);
                }
            });

            Ok(())
        })
        .build()
}
