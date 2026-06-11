use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use ai_agent_workspace_mcp::McpHandler;
use ai_agent_workspace_core::{SessionRegistry, LayoutStore};
use rmcp::serve_server;

mod session_resolution;

#[tokio::main]
async fn main() {
    let sessions = {
        let path = std::env::var("AIAW_SESSIONS_PATH")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let data_dir = dirs::data_dir().expect("Failed to find data directory");
                data_dir.join("AI Agent Workspace").join("sessions.json")
            });
        Arc::new(Mutex::new(
            SessionRegistry::new_with_path(path).expect("Failed to initialize session registry")
        ))
    };
    let layouts = Arc::new(Mutex::new(
        LayoutStore::new().expect("Failed to initialize layout store")
    ));

    let env_session_id = std::env::var("AIAW_SESSION_ID").ok();
    let cwd = std::env::current_dir().expect("Failed to get current directory");

    let (resolved_session_id, resolution_source) = match session_resolution::resolve_session_id(
        env_session_id.as_deref(),
        &cwd,
        &sessions.lock().unwrap(),
    ) {
        Ok(id) => {
            let source = if env_session_id.is_some() { "env-var" } else { "cwd-match" };
            eprintln!("[mcp-server] Resolved session: {} (source: {})", id, source);
            (Some(id), source.to_string())
        }
        Err(e) => {
            eprintln!("[mcp-server] {}", e);
            std::process::exit(1);
        }
    };

    let handler = McpHandler {
        sessions,
        layouts,
        on_session_changed: None,
        on_layouts_changed: None,
        resolved_session_id,
        resolution_source,
    };

    match serve_server(handler, rmcp::transport::io::stdio()).await {
        Ok(running) => {
            let _ = running.waiting().await;
        }
        Err(e) => {
            eprintln!("[mcp-server] Error: {}", e);
            std::process::exit(1);
        }
    }
}
