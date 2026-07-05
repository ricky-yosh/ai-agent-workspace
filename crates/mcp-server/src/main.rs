use std::path::PathBuf;
use std::io::Write;
use std::sync::{Arc, Mutex};
use ai_agent_workspace_mcp::{McpHandler, session_resolution};
use ai_agent_workspace_core::database::Database;
use ai_agent_workspace_core::socket::socket_path_from_db_path;
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

    let db = Database::new(db_path.clone());

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

    // Try to connect to Tauri's event socket for real-time UI updates.
    // If Tauri is not running, we silently skip — the file watcher is the safety net.
    let socket_path = socket_path_from_db_path(&db_path);
    eprintln!("[mcp-server] Attempting socket connection: {:?}", socket_path);

    let on_events = match connect_event_socket(&socket_path) {
        Ok(writer) => {
            eprintln!("[mcp-server] Connected to event socket");
            Some(Arc::new(move |events: &[ai_agent_workspace_core::DomainEvent]| {
                let mut writer = writer.lock().unwrap();
                for event in events {
                    if let Ok(json) = serde_json::to_string(event) {
                        // If the write fails, the socket is dead — just move on.
                        let _ = writer.write_all(json.as_bytes());
                        let _ = writer.write_all(b"\n");
                        let _ = writer.flush();
                    }
                }
            }) as Arc<dyn Fn(&[ai_agent_workspace_core::DomainEvent]) + Send + Sync>)
        }
        Err(e) => {
            eprintln!("[mcp-server] Could not connect to event socket: {}. Events will rely on file watcher.", e);
            None
        }
    };

    let handler = McpHandler {
        db,
        on_events,
        on_open_file_request: None,
        on_show_diff_request: None,
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

/// Attempts to connect to the event socket (Unix domain socket / named pipe).
/// Returns a shared writer handle if successful.
fn connect_event_socket(
    socket_path: &std::path::Path,
) -> Result<Arc<Mutex<Box<dyn Write + Send>>>, Box<dyn std::error::Error>> {
    use interprocess::local_socket::traits::Stream;
    use interprocess::local_socket::{GenericFilePath, ToFsName, Stream as LocalStream};

    let name = socket_path.to_fs_name::<GenericFilePath>()?;
    let stream = LocalStream::connect(name)?;
    stream.set_nonblocking(false)?;
    Ok(Arc::new(Mutex::new(Box::new(stream))))
}
