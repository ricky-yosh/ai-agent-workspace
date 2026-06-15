use std::path::PathBuf;
use ai_agent_workspace_mcp::{McpHandler, session_resolution};
use ai_agent_workspace_core::database::Database;
use rmcp::serve_server;

#[tokio::main]
async fn main() {
    let db_path = std::env::var("AIAW_DB_PATH")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let data_dir = dirs::data_dir().expect("Failed to find data directory");
            data_dir.join("AI Agent Workspace").join("workspace.db")
        });

    let db = Database::new(db_path);

    let env_session_id = std::env::var("AIAW_SESSION_ID").ok();
    let cwd = std::env::current_dir().expect("Failed to get current directory");

    let (resolved_session_id, resolution_source) = {
        let conn = db.connection().expect("Failed to connect to database");
        let sessions = db.sessions(&conn);
        match session_resolution::resolve_session_id_db(
            env_session_id.as_deref(),
            &cwd,
            &sessions,
        ) {
            Ok(id) => {
                let source = if env_session_id.is_some() { "env-var" } else { "cwd-match" };
                eprintln!("[mcp-server] Resolved session: {} (source: {})", id, source);
                (Some(id), source.to_string())
            }
            Err(e) => {
                eprintln!("[mcp-server] {}", e);
                eprintln!("[mcp-server] Session-scoped tools (workspace_*) will be unavailable until a session is resolved.");
                (None, "unresolved".to_string())
            }
        }
    };

    let handler = McpHandler {
        db,
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
