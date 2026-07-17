use std::io::{BufRead, BufReader};
use std::path::Path;
use tauri::Emitter;

/// Runs the local socket listener for events from the standalone MCP server.
///
/// Binds to a Unix domain socket (or named pipe on Windows) derived from the
/// database path, then loops accepting connections. Each connection's JSONL
/// stream is decoded and forwarded to the Tauri event bus via `app.emit()`.
///
/// # Errors
///
/// Returns an error if the socket cannot be bound or if accepting connections
/// fails persistently.
pub async fn run_event_socket_listener(
    app_handle: tauri::AppHandle,
    db_path: &Path,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use ai_agent_workspace_core::socket::socket_path_from_db_path;
    use interprocess::local_socket::{GenericFilePath, ListenerOptions, ToFsName, traits::Listener};
    use std::fs;

    let socket_path = socket_path_from_db_path(db_path);
    eprintln!("[event-socket] Binding to {:?}", socket_path);

    // Remove stale socket from a previous run
    if socket_path.exists() {
        if let Err(e) = fs::remove_file(&socket_path) {
            eprintln!("[event-socket] Failed to remove stale socket: {e}");
        }
    }

    // Ensure the parent directory exists
    if let Some(parent) = socket_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let socket_name = socket_path.clone().to_fs_name::<GenericFilePath>()?;
    let listener = ListenerOptions::new()
        .name(socket_name)
        .reclaim_name(true)
        .try_overwrite(true)
        .create_sync()?;

    eprintln!("[event-socket] Listening on {:?}", socket_path);

    // Accept connections in a blocking loop on a dedicated thread.
    // Each MCP server launch creates a new connection; we handle them sequentially.
    loop {
        match listener.accept() {
            Ok(connection) => {
                eprintln!("[event-socket] Accepted connection");
                let app = app_handle.clone();
                // Spawn a task to read events from this connection
                std::thread::spawn(move || {
                    handle_event_stream(app, connection);
                });
            }
            Err(e) => {
                eprintln!("[event-socket] Accept error: {e}");
                // Brief pause before retrying to avoid tight loop
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        }
    }
}

/// Reads JSONL lines from an accepted socket connection and emits each
/// deserialized DomainEvent via the Tauri app handle.
fn handle_event_stream(
    app: tauri::AppHandle,
    connection: interprocess::local_socket::Stream,
) {
    use ai_agent_workspace_core::DomainEvent;

    let reader = BufReader::new(connection);

    for line_result in reader.lines() {
        match line_result {
            Ok(line) => {
                let line = line.trim().to_string();
                if line.is_empty() {
                    continue;
                }
                match serde_json::from_str::<DomainEvent>(&line) {
                    Ok(event) => {
                        emit_domain_event(&app, &event);
                    }
                    Err(e) => {
                        eprintln!("[event-socket] Failed to deserialize event: {e}");
                    }
                }
            }
            Err(e) => {
                // Connection closed or read error — stop reading
                eprintln!("[event-socket] Read error (connection ended): {e}");
                break;
            }
        }
    }

    eprintln!("[event-socket] Connection closed");
}

/// Maps a single DomainEvent to the appropriate Tauri emit call.
/// This is shared between the embedded plugin and the socket listener.
pub fn emit_domain_event(app: &tauri::AppHandle, event: &ai_agent_workspace_core::DomainEvent) {
    use ai_agent_workspace_core::DomainEvent;

    match event {
        DomainEvent::SessionsChanged => {
            let _ = app.emit("sessions-changed", ());
        }
        DomainEvent::LayoutsChanged => {
            let _ = app.emit("layouts-changed", ());
        }
        DomainEvent::WorkspaceChanged {
            session_id,
            workspace_id,
            screen,
        } => {
            #[derive(serde::Serialize, Clone)]
            struct WorkspaceChangedPayload {
                session_id: String,
                workspace_id: String,
                screen: ai_agent_workspace_core::Screen,
            }
            let _ = app.emit(
                "workspace-changed",
                WorkspaceChangedPayload {
                    session_id: session_id.clone(),
                    workspace_id: workspace_id.clone(),
                    screen: screen.clone(),
                },
            );
        }
        DomainEvent::IssuesChanged { session_id } => {
            let _ = app.emit(
                "issues-changed",
                serde_json::json!({ "session_id": session_id }),
            );
        }
        DomainEvent::VisualCanvasesChanged { session_id } => {
            let _ = app.emit(
                "visual-canvases-changed",
                serde_json::json!({ "session_id": session_id }),
            );
        }
        DomainEvent::CanvasNodesChanged {
            session_id,
            canvas_id,
        } => {
            let _ = app.emit(
                "canvas-nodes-changed",
                serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }),
            );
        }
        DomainEvent::CanvasEdgesChanged {
            session_id,
            canvas_id,
        } => {
            let _ = app.emit(
                "canvas-edges-changed",
                serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }),
            );
        }
        DomainEvent::CanvasGroupsChanged {
            session_id,
            canvas_id,
        } => {
            let _ = app.emit(
                "canvas-groups-changed",
                serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }),
            );
        }
        DomainEvent::CanvasTagsChanged {
            session_id,
            canvas_id,
        } => {
            let _ = app.emit(
                "canvas-tags-changed",
                serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }),
            );
        }
        DomainEvent::CanvasNodeSourcesChanged {
            session_id,
            canvas_id,
        } => {
            let _ = app.emit(
                "canvas-node-sources-changed",
                serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }),
            );
        }
        DomainEvent::C4DiagramsChanged { repo_path } => {
            let _ = app.emit(
                "c4-diagrams-changed",
                serde_json::json!({ "repo_path": repo_path }),
            );
        }
    }
}
