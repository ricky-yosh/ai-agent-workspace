pub mod error;

use std::sync::{Arc, Mutex};
use rmcp::{ServerHandler, serve_server, tool};
use rmcp::model::{CallToolResult, Content, ServerInfo};
use ai_agent_workspace_core::{SessionRegistry, LayoutStore};
use ai_agent_workspace_commands::{AppState, Command, CommandResult, execute};
use tauri::{AppHandle, Manager};

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
    rmcp::tool_box!(McpHandler { session_list });

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
