use tauri::{Emitter, Manager};
use tauri::menu::*;
use ai_agent_workspace_commands::{
    AppState, Command, CommandResult, execute,
};
use ai_agent_workspace_core::{
    Session, SessionSummary, WorkspaceInstance,
    Layout, Screen, DomainEvent,
};

mod pty;
use pty::{PtyStore, PtySpawnResult};

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
    std::path::Path::new(&path).join(".git").exists()
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
        let conn = app_state.db.connection().map_err(|e| e.to_string())?;
        let sessions = app_state.db.sessions(&conn);
        let session = sessions.get(&session_id).map_err(|e| e.to_string())?;
        session.working_directory
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
        .setup(|app| {
            ensure_cli_installed();

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
            open_preferences,
            open_in_app,
            is_git_repo,
            check_mcp_binary,
            pty_spawn,
            pty_write,
            pty_ack,
            pty_resize,
            pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
