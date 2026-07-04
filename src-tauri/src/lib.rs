use tauri::{Emitter, Manager};
use tauri::menu::*;
use ai_agent_workspace_commands::{
    AppState, Command, CommandResult, execute,
};
use ai_agent_workspace_core::{
    Session, SessionSummary, WorkspaceInstance,
    Layout, Screen, Issue, ChangeEvent, VisualCanvas, CanvasNode, CanvasEdge, CanvasGroup, CanvasTag, CanvasViewState, C4Diagram, DomainEvent,
};
use ai_agent_workspace_git_operations;

mod pty;
use pty::{PtyStore, PtySpawnResult};

mod db_watcher;

const PREFERENCES_WINDOW_LABEL: &str = "preferences";
const APP_DATA_DIR_NAME: &str = "AI Agent Workspace";
const CLI_NAME: &str = "aiaw-mcp-server";
const CLI_INSTALL_PATH: &str = "/usr/local/bin/aiaw-mcp-server";
const PREFERENCES_WINDOW_SIZE: (f64, f64) = (520.0, 480.0);

fn emit_domain_events(app: &tauri::AppHandle, events: &[DomainEvent]) {
    for event in events {
        match event {
            DomainEvent::SessionsChanged => { let _ = app.emit("sessions-changed", ()); }
            DomainEvent::LayoutsChanged => { let _ = app.emit("layouts-changed", ()); }
            DomainEvent::WorkspaceChanged { session_id, workspace_id, screen } => {
                #[derive(serde::Serialize, Clone)]
                struct WorkspaceChangedPayload {
                    session_id: String,
                    workspace_id: String,
                    screen: Screen,
                }
                let _ = app.emit("workspace-changed", WorkspaceChangedPayload { session_id: session_id.clone(), workspace_id: workspace_id.clone(), screen: screen.clone() });
            }
            DomainEvent::IssuesChanged { session_id } => {
                let _ = app.emit("issues-changed", serde_json::json!({ "session_id": session_id }));
            }
            DomainEvent::VisualCanvasesChanged { session_id } => {
                let _ = app.emit("visual-canvases-changed", serde_json::json!({ "session_id": session_id }));
            }
            DomainEvent::CanvasNodesChanged { session_id, canvas_id } => {
                let _ = app.emit("canvas-nodes-changed", serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }));
            }
            DomainEvent::CanvasEdgesChanged { session_id, canvas_id } => {
                let _ = app.emit("canvas-edges-changed", serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }));
            }
            DomainEvent::CanvasGroupsChanged { session_id, canvas_id } => {
                let _ = app.emit("canvas-groups-changed", serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }));
            }
            DomainEvent::CanvasTagsChanged { session_id, canvas_id } => {
                let _ = app.emit("canvas-tags-changed", serde_json::json!({ "session_id": session_id, "canvas_id": canvas_id }));
            }
            DomainEvent::C4DiagramsChanged { repo_path } => {
                let _ = app.emit("c4-diagrams-changed", serde_json::json!({ "repo_path": repo_path }));
            }
        }
    }
}

// Shared command-execution macro. Generates a #[tauri::command] fn that
// wraps execute(Command::..., &state) with a single Ok arm.
macro_rules! command_handler {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $result_variant:ident, $result_ty:ty,
     $($param:ident: $pty:ty),* $(,)?) => {
        #[tauri::command]
        fn $fn_name(state: tauri::State<AppState>, app: tauri::AppHandle, $($param: $pty,)* ) -> Result<$result_ty, String> {
            let cmd = Command::$cmd_variant { $($field),* };
            match execute(cmd, &state) {
                Ok(outcome) => {
                    emit_domain_events(&app, &outcome.events);
                    match outcome.result {
                        CommandResult::$result_variant(x) => Ok(x),
                        _ => Err(format!(
                            "Unexpected command result variant for {}",
                            stringify!($cmd_variant)
                        )),
                    }
                }
                Err(e) => Err(serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())),
            }
        }
    };
    ($fn_name:ident, $cmd_variant:ident,
     $result_variant:ident, $result_ty:ty) => {
        #[tauri::command]
        fn $fn_name(state: tauri::State<AppState>, app: tauri::AppHandle) -> Result<$result_ty, String> {
            match execute(Command::$cmd_variant, &state) {
                Ok(outcome) => {
                    emit_domain_events(&app, &outcome.events);
                    match outcome.result {
                        CommandResult::$result_variant(x) => Ok(x),
                        _ => Err(format!(
                            "Unexpected command result variant for {}",
                            stringify!($cmd_variant)
                        )),
                    }
                }
                Err(e) => Err(serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())),
            }
        }
    };
}

macro_rules! session_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $($param:ident: $pty:ty),* $(,)?) => {
        command_handler!($fn_name, $cmd_variant { $($field),* }, Session, Session, $($param: $pty),*);
    };
}

macro_rules! unit_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $($param:ident: $pty:ty),* $(,)?) => {
        command_handler!($fn_name, $cmd_variant { $($field),* }, Unit, (), $($param: $pty),*);
    };
    ($fn_name:ident, $cmd_variant:ident) => {
        command_handler!($fn_name, $cmd_variant, Unit, ());
    };
}

macro_rules! list_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $($param:ident: $pty:ty),* $(,)?) => {
        command_handler!($fn_name, $cmd_variant { $($field),* }, Sessions, Vec<SessionSummary>, $($param: $pty),*);
    };
    ($fn_name:ident, $cmd_variant:ident) => {
        command_handler!($fn_name, $cmd_variant, Sessions, Vec<SessionSummary>);
    };
}

macro_rules! single_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $($param:ident: $pty:ty),* $(,)?) => {
        command_handler!($fn_name, $cmd_variant { $($field),* }, Layout, Layout, $($param: $pty),*);
    };
}

macro_rules! layouts_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $($param:ident: $pty:ty),* $(,)?) => {
        command_handler!($fn_name, $cmd_variant { $($field),* }, Layouts, Vec<Layout>, $($param: $pty),*);
    };
    ($fn_name:ident, $cmd_variant:ident) => {
        command_handler!($fn_name, $cmd_variant, Layouts, Vec<Layout>);
    };
}

macro_rules! workspace_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $($param:ident: $pty:ty),* $(,)?) => {
        command_handler!($fn_name, $cmd_variant { $($field),* }, Workspace, WorkspaceInstance, $($param: $pty),*);
    };
}

macro_rules! workspaces_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $($param:ident: $pty:ty),* $(,)?) => {
        command_handler!($fn_name, $cmd_variant { $($field),* }, Workspaces, Vec<WorkspaceInstance>, $($param: $pty),*);
    };
}

macro_rules! option_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $some_variant:ident,
     $($param:ident: $pty:ty),* $(,)?) => {
        #[tauri::command]
        fn $fn_name(state: tauri::State<AppState>, app: tauri::AppHandle, $($param: $pty,)* ) -> Result<Option<WorkspaceInstance>, String> {
            let cmd = Command::$cmd_variant { $($field),* };
            match execute(cmd, &state) {
                Ok(outcome) => {
                    emit_domain_events(&app, &outcome.events);
                    match outcome.result {
                        CommandResult::$some_variant(ws) => Ok(Some(ws)),
                        CommandResult::Unit(()) => Ok(None),
                        _ => Err(format!(
                            "Unexpected command result variant for {}",
                            stringify!($cmd_variant)
                        )),
                    }
                }
                Err(e) => Err(serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())),
            }
        }
    };
}

macro_rules! unit_void_return {
    ($cmd_variant:ident { $($field:ident $(: $val:expr)?),* $(,)? }, $state:ident, $app:ident) => {
        match execute(Command::$cmd_variant { $($field $(: $val)?),* }, &$state) {
            Ok(outcome) => {
                emit_domain_events(&$app, &outcome.events);
                match outcome.result {
                    CommandResult::Unit(()) => {}
                    _ => return Err(format!(
                        "Unexpected command result variant for {}",
                        stringify!($cmd_variant)
                    )),
                }
            }
            Err(e) => return Err(serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())),
        }
    };
}

// ── Session commands ────────────────────────────────────────────────

session_return!(create_session, SessionCreate { working_dir, name }, working_dir: String, name: String);
list_return!(list_sessions, SessionList);
session_return!(rename_session, SessionRename { session_id, new_name }, session_id: String, new_name: String);
unit_return!(delete_session, SessionDelete { session_id }, session_id: String);
session_return!(open_session, SessionOpen { session_id }, session_id: String);
session_return!(close_session, SessionClose { session_id }, session_id: String);
unit_return!(delete_all_sessions, SessionDeleteAll);

// ── Layout / template commands ──────────────────────────────────────

layouts_return!(list_layouts, TemplateList);
single_return!(save_layout, TemplateSave { name, screen }, name: String, screen: Screen);
unit_return!(delete_layout, TemplateDelete { layout_id }, layout_id: String);
unit_return!(rename_layout, TemplateRename { layout_id, new_name }, layout_id: String, new_name: String);
unit_return!(delete_all_templates, TemplateDeleteAll);

// ── Workspace commands ──────────────────────────────────────────────

workspaces_return!(get_session_workspaces, WorkspaceList { session_id }, session_id: String);
option_return!(get_active_workspace, WorkspaceGetActive { session_id }, Workspace, session_id: String);
workspace_return!(add_workspace, WorkspaceAdd { session_id, template_id }, session_id: String, template_id: String);
unit_return!(remove_workspace, WorkspaceRemove { session_id, workspace_id }, session_id: String, workspace_id: String);
unit_return!(rename_workspace, WorkspaceRename { session_id, workspace_id, new_name }, session_id: String, workspace_id: String, new_name: String);
unit_return!(set_active_workspace, WorkspaceSetActive { session_id, workspace_id }, session_id: String, workspace_id: String);
workspace_return!(reset_workspace_to_template, WorkspaceReset { session_id, workspace_id }, session_id: String, workspace_id: String);
workspace_return!(split_area, SplitArea { session_id, workspace_id, area_id, axis, factor }, session_id: String, workspace_id: String, area_id: String, axis: ai_agent_workspace_core::Axis, factor: f64);
workspace_return!(join_areas, JoinAreas { session_id, workspace_id, source_area_id, target_area_id }, session_id: String, workspace_id: String, source_area_id: String, target_area_id: String);
workspace_return!(close_area, CloseArea { session_id, workspace_id, area_id }, session_id: String, workspace_id: String, area_id: String);
workspace_return!(resize_edge, ResizeEdge { session_id, workspace_id, edge_id, position }, session_id: String, workspace_id: String, edge_id: String, position: f64);
workspace_return!(change_panel_type, ChangePanelType { session_id, workspace_id, area_id, panel_type }, session_id: String, workspace_id: String, area_id: String, panel_type: String);

// ── Issue commands ──────────────────────────────────────────────────

command_handler!(list_issues, IssueList { session_id }, Issues, Vec<Issue>, session_id: String);
command_handler!(get_issue, IssueGet { id, session_id }, Issue, Issue, id: String, session_id: Option<String>);

// ── Visual Canvas commands ──────────────────────────────────────────

command_handler!(list_visual_canvases, VisualCanvasList { session_id }, VisualCanvases, Vec<VisualCanvas>, session_id: String);

// ── Canvas Node commands ────────────────────────────────────────────

command_handler!(create_canvas_node, CanvasNodeCreate { canvas_id, content, x, y, width, height, metadata_json }, CanvasNode, CanvasNode, canvas_id: String, content: String, x: f64, y: f64, width: f64, height: f64, metadata_json: Option<String>);
command_handler!(list_canvas_nodes, CanvasNodeList { canvas_id }, CanvasNodes, Vec<CanvasNode>, canvas_id: String);
command_handler!(get_canvas_node, CanvasNodeGet { id }, CanvasNode, CanvasNode, id: String);
command_handler!(update_canvas_node, CanvasNodeUpdate { id, content, x, y, width, height, metadata_json }, CanvasNode, CanvasNode, id: String, content: Option<String>, x: Option<f64>, y: Option<f64>, width: Option<f64>, height: Option<f64>, metadata_json: Option<String>);
unit_return!(delete_canvas_node, CanvasNodeDelete { id }, id: String);

// ── Canvas Edge commands ────────────────────────────────────────

command_handler!(list_canvas_edges, CanvasEdgeList { canvas_id }, CanvasEdges, Vec<CanvasEdge>, canvas_id: String);
command_handler!(get_canvas_edge, CanvasEdgeGet { id }, CanvasEdge, CanvasEdge, id: String);
command_handler!(update_canvas_edge, CanvasEdgeUpdate { id, label, metadata_json }, CanvasEdge, CanvasEdge, id: String, label: Option<String>, metadata_json: Option<String>);
unit_return!(delete_canvas_edge, CanvasEdgeDelete { id }, id: String);

// ── Canvas Group commands ──────────────────────────────────────

command_handler!(list_canvas_groups, CanvasGroupList { canvas_id }, CanvasGroups, Vec<CanvasGroup>, canvas_id: String);
command_handler!(get_canvas_group, CanvasGroupGet { id }, CanvasGroup, CanvasGroup, id: String);
command_handler!(update_canvas_group, CanvasGroupUpdate { id, label, node_ids_json, metadata_json }, CanvasGroup, CanvasGroup, id: String, label: Option<String>, node_ids_json: Option<String>, metadata_json: Option<String>);
unit_return!(delete_canvas_group, CanvasGroupDelete { id }, id: String);

// ── Canvas Tag commands ────────────────────────────────────────

command_handler!(list_canvas_tags_by_node, CanvasTagListByNode { node_id }, CanvasTags, Vec<CanvasTag>, node_id: String);
command_handler!(list_canvas_tags_by_canvas, CanvasTagListByCanvas { canvas_id }, CanvasTags, Vec<CanvasTag>, canvas_id: String);

// ── Canvas View State commands ──────────────────────────────────

command_handler!(get_canvas_view_state, CanvasViewStateGet { canvas_id }, CanvasViewState, CanvasViewState, canvas_id: String);
command_handler!(update_canvas_view_state, CanvasViewStateUpdate { canvas_id, offset_x, offset_y, zoom }, CanvasViewState, CanvasViewState, canvas_id: String, offset_x: f64, offset_y: f64, zoom: f64);

// ── Change event commands ──────────────────────────────────────

command_handler!(list_change_events, ChangeEventList { session_id }, ChangeEvents, Vec<ChangeEvent>, session_id: String);
command_handler!(mark_change_event_processed, ChangeEventMarkProcessed { event_id }, Unit, (), event_id: String);

// ── C4 Diagram commands ──────────────────────────────────────

command_handler!(list_c4_diagrams, C4DiagramList { repo_path }, C4Diagrams, Vec<C4Diagram>, repo_path: String);
command_handler!(get_c4_diagram, C4DiagramGet { id }, C4Diagram, C4Diagram, id: String);
unit_return!(delete_c4_diagram, C4DiagramDelete { id }, id: String);
command_handler!(rename_c4_diagram, C4DiagramRename { id, name }, C4Diagram, C4Diagram, id: String, name: String);

// ── Non-macro commands ──────────────────────────────────────────────

#[tauri::command]
fn persist_workspace_screen(
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
    session_id: String,
    workspace_id: String,
    screen: Screen,
) -> Result<(), String> {
    unit_void_return!(
        WorkspaceUpdateScreen { session_id: session_id.clone(), workspace_id: workspace_id.clone(), screen },
        state, app
    );
    Ok(())
}

fn focus_or_open_preferences(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.webview_windows().get(PREFERENCES_WINDOW_LABEL) {
        let _ = window.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        PREFERENCES_WINDOW_LABEL,
        tauri::WebviewUrl::App("preferences.html".into()),
    )
        .title("Preferences")
        .inner_size(PREFERENCES_WINDOW_SIZE.0, PREFERENCES_WINDOW_SIZE.1)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_preferences(app: tauri::AppHandle) -> Result<(), String> {
    focus_or_open_preferences(&app)
}

#[derive(Debug, Clone, serde::Serialize)]
struct ReadFileResult {
    content: String,
    size: u64,
}

type GitDiffResult = ai_agent_workspace_git_operations::GitDiffResult;

#[tauri::command]
fn read_file(
    state: tauri::State<AppState>,
    session_id: String,
    file_path: String,
) -> Result<ReadFileResult, String> {
    // Resolve the session's working directory (single lightweight SELECT)
    let working_dir = state.db.get_working_directory(&session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Resolve the file path relative to the working directory
    let base = std::path::Path::new(&working_dir);
    let resolved = base.join(&file_path);

    // Security: ensure the resolved path is within the working directory
    let canonical_base = base.canonicalize()
        .map_err(|e| format!("Failed to resolve working directory: {}", e))?;
    let canonical_resolved = resolved.canonicalize()
        .map_err(|e| format!("Failed to resolve file path: {}", e))?;

    if !canonical_resolved.starts_with(&canonical_base) {
        return Err("Access denied: path escapes the working directory".to_string());
    }

    // Read only the first 8KB for efficient binary detection
    let mut buf = [0u8; 8192];
    let mut file = std::fs::File::open(&canonical_resolved)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    use std::io::Read;
    let bytes_read = file.read(&mut buf)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Check for null bytes in the prefix — strong binary indicator
    if buf[..bytes_read].contains(&0) {
        return Err("Binary file detected".to_string());
    }

    // Read the rest of the file if it's not binary
    let size = std::fs::metadata(&canonical_resolved)
        .map_err(|e| format!("Failed to stat file: {}", e))?
        .len();

    let mut content = String::with_capacity(size as usize);
    content.push_str(std::str::from_utf8(&buf[..bytes_read])
        .map_err(|e| format!("Binary file detected: {}", e))?);
    file.read_to_string(&mut content)
        .map_err(|e| format!("Failed to read file as UTF-8: {}", e))?;

    Ok(ReadFileResult { content, size })
}

#[derive(Debug, Clone, serde::Serialize)]
struct DirectoryEntry {
    name: String,
    path: String,
    is_dir: bool,
    is_hidden: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
struct DirectoryListing {
    entries: Vec<DirectoryEntry>,
}

const DEFAULT_EXCLUDES: &[&str] = &[
    "node_modules", ".git", "target", "dist", ".next",
    "__pycache__", ".cache", "build", "out", ".turbo", ".parcel-cache",
];

#[tauri::command]
fn list_directory(
    state: tauri::State<AppState>,
    session_id: String,
    dir_path: String,
) -> Result<DirectoryListing, String> {
    // Resolve the session's working directory (single lightweight SELECT)
    let working_dir = state.db.get_working_directory(&session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Resolve the directory path relative to the working directory
    let base = std::path::Path::new(&working_dir);
    let resolved = if dir_path.is_empty() {
        base.to_path_buf()
    } else {
        base.join(&dir_path)
    };

    // Security: ensure the resolved path is within the working directory
    let canonical_base = base.canonicalize()
        .map_err(|e| format!("Failed to resolve working directory: {}", e))?;
    let canonical_resolved = resolved.canonicalize()
        .map_err(|e| format!("Failed to resolve directory path: {}", e))?;

    if !canonical_resolved.starts_with(&canonical_base) {
        return Err("Access denied: path escapes the working directory".to_string());
    }

    // Read directory entries
    let read_dir = std::fs::read_dir(&canonical_resolved)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut entries: Vec<DirectoryEntry> = Vec::new();

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_hidden = name.starts_with('.');
        let metadata = entry.metadata()
            .map_err(|e| format!("Failed to read entry metadata: {}", e))?;
        let is_dir = metadata.is_dir();

        // Filter default excludes
        if DEFAULT_EXCLUDES.contains(&name.as_str()) {
            continue;
        }

        // Compute relative path
        let full_path = entry.path();
        let path = full_path.strip_prefix(&canonical_base)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .to_string();

        entries.push(DirectoryEntry { name, path, is_dir, is_hidden });
    }

    // Sort: directories first, then alphabetical (case-insensitive).
    // Uses byte-level ASCII case folding to avoid O(n log n) allocations.
    entries.sort_unstable_by(|a, b| {
        b.is_dir.cmp(&a.is_dir)
            .then_with(|| {
                a.name.bytes().map(|b| b.to_ascii_lowercase())
                    .zip(b.name.bytes().map(|b| b.to_ascii_lowercase()))
                    .find(|(x, y)| x != y)
                    .map(|(x, y)| x.cmp(&y))
                    .unwrap_or_else(|| a.name.len().cmp(&b.name.len()))
            })
    });

    Ok(DirectoryListing { entries })
}

#[tauri::command]
fn get_git_diff(
    state: tauri::State<AppState>,
    session_id: String,
    staged: bool,
) -> Result<GitDiffResult, String> {
    let working_dir = state.db.get_working_directory(&session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    ai_agent_workspace_git_operations::get_diff(&working_dir, staged)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_in_app(path: String, app_name: String) -> Result<(), String> {
    use std::process::Command;
    let status = Command::new("/usr/bin/open")
        .arg("-a")
        .arg(&app_name)
        .arg(&path)
        .status()
        .map_err(|e| format!("Failed to launch {}: {}", app_name, e))?;
    if !status.success() {
        return Err(format!("Unable to find application named '{}'. Is it installed?", app_name));
    }
    Ok(())
}

#[tauri::command]
fn is_git_repo(path: String) -> bool {
    ai_agent_workspace_git_operations::is_git_repo(&path)
}

#[derive(Debug, Clone, serde::Serialize)]
struct BinaryStatus {
    present: bool,
    executable: bool,
    path: String,
}

#[tauri::command]
fn check_mcp_binary(app: tauri::AppHandle) -> Result<BinaryStatus, String> {
    // Probe the production bundle location first, then fall back to the dev
    // build outputs. In `tauri dev` there is no `.app` bundle, so the binary
    // declared in tauri.conf.json (`target/release/aiaw-mcp-server`) is never
    // copied next to the running debug binary; we have to look it up directly
    // in the workspace `target/` tree instead.
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();

    match app.path().resource_dir() {
        Ok(dir) => candidates.push(dir.join(CLI_NAME)),
        Err(e) => eprintln!("[mcp-check] resource_dir unavailable: {}", e),
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Same profile dir as the running app, e.g. target/debug/aiaw-mcp-server.
            candidates.push(exe_dir.join(CLI_NAME));

            // Workspace target root: scan both profiles.
            if let Some(target_dir) = exe_dir.parent() {
                candidates.push(target_dir.join("release").join(CLI_NAME));
                candidates.push(target_dir.join("debug").join(CLI_NAME));
            }
        }
    }

    for candidate in &candidates {
        println!("[mcp-check] probing {}", candidate.display());
        if !candidate.exists() {
            continue;
        }
        match std::fs::metadata(candidate) {
            Ok(meta) => {
                let non_empty = meta.len() > 0;
                let is_exec = {
                    use std::os::unix::fs::PermissionsExt;
                    meta.permissions().mode() & 0o111 != 0
                };
                if non_empty {
                    println!(
                        "[mcp-check] found {} (executable={})",
                        candidate.display(),
                        is_exec
                    );
                    return Ok(BinaryStatus {
                        present: true,
                        executable: is_exec,
                        path: candidate.to_string_lossy().to_string(),
                    });
                }
            }
            Err(e) => eprintln!(
                "[mcp-check] metadata failed for {}: {}",
                candidate.display(),
                e
            ),
        }
    }

    let reported = candidates
        .first()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| CLI_NAME.to_string());

    eprintln!(
        "[mcp-check] {} not found in any candidate path (build it with `cargo build -p {} --release`)",
        CLI_NAME, CLI_NAME
    );

    Ok(BinaryStatus {
        present: false,
        executable: false,
        path: reported,
    })
}

#[tauri::command]
fn pty_spawn(
    state: tauri::State<PtyStore>,
    app: tauri::AppHandle,
    terminal_id: String,
    session_id: String,
    on_event: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>,
) -> Result<PtySpawnResult, String> {
    let pty_command = {
        use tauri_plugin_store::StoreExt;
        let store = app.store("preferences.json").map_err(|e| e.to_string())?;
        store.get("pty_command").and_then(|v| v.as_str().map(String::from))
    };

    let working_directory = {
        let app_state = app.state::<AppState>();
        app_state.db.get_working_directory(&session_id).map_err(|e| e.to_string())?
    };

    pty::pty_spawn(
        &state,
        app,
        terminal_id,
        pty_command,
        session_id,
        working_directory,
        on_event,
    )
}

#[tauri::command]
fn pty_write(
    state: tauri::State<PtyStore>,
    pty_id: String,
    data: String,
) -> Result<(), String> {
    pty::pty_write(&state, &pty_id, data.as_bytes())
}

#[tauri::command]
fn pty_ack(
    state: tauri::State<PtyStore>,
    pty_id: String,
    bytes: usize,
) -> Result<(), String> {
    pty::pty_ack(&state, &pty_id, bytes)
}

#[tauri::command]
fn pty_resize(
    state: tauri::State<PtyStore>,
    pty_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty::pty_resize(&state, &pty_id, cols, rows)
}

#[tauri::command]
fn pty_kill(
    state: tauri::State<PtyStore>,
    terminal_id: String,
) -> Result<(), String> {
    pty::pty_kill(&state, &terminal_id)
}

// ── CLI install ─────────────────────────────────────────────────────

fn ensure_cli_installed() {
    let target = std::path::Path::new(CLI_INSTALL_PATH);

    if target.exists() || target.is_symlink() {
        if let Ok(link) = std::fs::read_link(target) {
            if link.exists() {
                println!("[cli] {} already installed at {}", CLI_NAME, CLI_INSTALL_PATH);
                return;
            }
        }
    }

    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[cli] Cannot locate app binary: {}", e);
            return;
        }
    };
    let resource = exe
        .parent().and_then(|p| p.parent())
        .map(|p| p.join("Resources").join(CLI_NAME));

    let resource = match resource {
        Some(r) if r.exists() => r,
        _ => {
            println!("[cli] {} not found in app bundle — skipping CLI install (dev mode?)", CLI_NAME);
            return;
        }
    };

    match std::os::unix::fs::symlink(&resource, target) {
        Ok(()) => {
            println!("[cli] Installed {} → {}", CLI_NAME, resource.display());
        }
        Err(e) => {
            eprintln!("[cli] Failed to install {}: {}", CLI_NAME, e);
            eprintln!("[cli] Manual install: sudo ln -sf \"{}\" {}", resource.display(), CLI_INSTALL_PATH);
        }
    }
}

// ── Application entry point ─────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = dirs::data_dir().expect("No data directory");
    let db_path = data_dir.join(APP_DATA_DIR_NAME).join("workspace.db");
    let db_path_for_watcher = db_path.clone();
    let app_state = AppState::new(db_path);

    // Demote any sessions that were left Running from a previous run
    {
        let conn = app_state.db.connection().expect("Failed to connect to database");
        let sessions = app_state.db.sessions(&conn);
        sessions.demote_running_to_paused().expect("Failed to demote running sessions");
    }

    let pty_store = PtyStore::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(ai_agent_workspace_mcp::init())
        .manage(app_state)
        .manage(pty_store)
        .setup(move |app| {
            ensure_cli_installed();

            // Spawn DB file watcher for real-time updates from external
            // processes (e.g. the MCP server) that modify the database directly.
            db_watcher::spawn_db_watcher(app.handle().clone(), &db_path_for_watcher);

            let submenu = Submenu::with_items(
                app,
                "AI Agent Workspace",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About AI Agent Workspace"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "open_preferences", "Preferences...", true, Some("Cmd+,"))
                        .map_err(|e| e.to_string())?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("Quit AI Agent Workspace"))?,
                ],
            )?;
            let menu = Menu::with_items(
                app,
                &[
                    &submenu,
                ],
            )?;
            app.set_menu(menu)?;

            app.on_menu_event(move |app, event| {
                if event.id().as_ref() == "open_preferences" {
                    let _ = focus_or_open_preferences(app);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            list_sessions,
            rename_session,
            delete_session,
            open_session,
            close_session,
            delete_all_sessions,
            list_layouts,
            save_layout,
            delete_layout,
            rename_layout,
            delete_all_templates,
            get_session_workspaces,
            get_active_workspace,
            add_workspace,
            remove_workspace,
            rename_workspace,
            set_active_workspace,
            persist_workspace_screen,
            reset_workspace_to_template,
            split_area,
            join_areas,
            close_area,
            resize_edge,
            change_panel_type,
            list_issues,
            get_issue,
            list_visual_canvases,
            create_canvas_node,
            list_canvas_nodes,
            get_canvas_node,
            update_canvas_node,
            delete_canvas_node,
            list_canvas_edges,
            get_canvas_edge,
            update_canvas_edge,
            delete_canvas_edge,
            list_canvas_groups,
            get_canvas_group,
            update_canvas_group,
            delete_canvas_group,
            list_canvas_tags_by_node,
            list_canvas_tags_by_canvas,
            get_canvas_view_state,
            update_canvas_view_state,
            list_change_events,
            mark_change_event_processed,
            list_c4_diagrams,
            get_c4_diagram,
            delete_c4_diagram,
            rename_c4_diagram,
            open_preferences,
            open_in_app,
            is_git_repo,
            check_mcp_binary,
            pty_spawn,
            pty_write,
            pty_ack,
            pty_resize,
            pty_kill,
            read_file,
            list_directory,
            get_git_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
