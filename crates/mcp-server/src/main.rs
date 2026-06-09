use std::sync::{Arc, Mutex};
use ai_agent_workspace_mcp::McpHandler;
use ai_agent_workspace_core::{SessionRegistry, LayoutStore};
use rmcp::serve_server;

#[tokio::main]
async fn main() {
    let sessions = Arc::new(Mutex::new(
        SessionRegistry::new().expect("Failed to initialize session registry")
    ));
    let layouts = Arc::new(Mutex::new(
        LayoutStore::new().expect("Failed to initialize layout store")
    ));

    let handler = McpHandler {
        sessions,
        layouts,
        on_session_changed: None,
        on_layouts_changed: None,
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
