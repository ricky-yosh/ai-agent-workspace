use std::sync::{Arc, Mutex};
use rmcp::{ServerHandler, serve_server};
use rmcp::model::ServerInfo;
use ai_agent_workspace_core::{SessionRegistry, LayoutStore};
use ai_agent_workspace_commands::AppState;
use tauri::{AppHandle, Manager};

#[derive(Clone)]
struct McpHandler {
    sessions: Arc<Mutex<SessionRegistry>>,
    layouts: Arc<Mutex<LayoutStore>>,
    app: AppHandle,
}

impl ServerHandler for McpHandler {
    rmcp::tool_box!(@derive tool_box);

    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some("AI Agent Workspace MCP Server".into()),
            ..Default::default()
        }
    }
}

impl McpHandler {
    rmcp::tool_box!(McpHandler {} tool_box);
}

pub fn init() -> tauri::plugin::Builder<tauri::Wry> {
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
}
