use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri::menu::*;
use ai_agent_workspace_commands::{
    AppState, Command, CommandResult, execute,
};
use ai_agent_workspace_core::{
    Session, SessionSummary, WorkspaceInstance,
    Layout, LayoutTree, LayoutStore,
};
use ai_agent_workspace_core::session_registry::SessionRegistry;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};

mod pty;
use pty::{PtyStore, PtySpawnResult};

const PREFERENCES_WINDOW_LABEL: &str = "preferences";
const EVENT_SESSIONS_CHANGED: &str = "sessions-changed";
const EVENT_LAYOUTS_CHANGED: &str = "layouts-changed";
const SESSIONS_FILE: &str = "sessions.json";
const LAYOUTS_FILE: &str = "layouts.json";
const APP_DATA_DIR_NAME: &str = "AI Agent Workspace";
const CLI_NAME: &str = "aiaw-mcp-server";
const CLI_INSTALL_PATH: &str = "/usr/local/bin/aiaw-mcp-server";
const PREFERENCES_WINDOW_SIZE: (f64, f64) = (520.0, 480.0);

// Shared command-execution macro. Generates a #[tauri::command] fn that
// wraps execute(Command::..., &state) with a single Ok arm.
macro_rules! command_handler {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $result_variant:ident, $result_ty:ty,
     $($param:ident: $pty:ty),* $(,)?) => {
        #[tauri::command]
        fn $fn_name(state: tauri::State<AppState>, $($param: $pty,)* ) -> Result<$result_ty, String> {
            let cmd = Command::$cmd_variant { $($field),* };
            match execute(cmd, &state) {
                Ok(CommandResult::$result_variant(x)) => Ok(x),
                Ok(_) => Err(format!(
                    "Unexpected command result variant for {}",
                    stringify!($cmd_variant)
                )),
                Err(e) => Err(e.to_string()),
            }
        }
    };
    ($fn_name:ident, $cmd_variant:ident,
     $result_variant:ident, $result_ty:ty) => {
        #[tauri::command]
        fn $fn_name(state: tauri::State<AppState>) -> Result<$result_ty, String> {
            match execute(Command::$cmd_variant, &state) {
                Ok(CommandResult::$result_variant(x)) => Ok(x),
                Ok(_) => Err(format!(
                    "Unexpected command result variant for {}",
                    stringify!($cmd_variant)
                )),
                Err(e) => Err(e.to_string()),
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

#[allow(unused_macros)]
macro_rules! sessions_return {
    ($fn_name:ident, $cmd_variant:ident { $($field:ident),* $(,)? },
     $($param:ident: $pty:ty),* $(,)?) => {
        command_handler!($fn_name, $cmd_variant { $($field),* }, Sessions, Vec<SessionSummary>, $($param: $pty),*);
    };
    ($fn_name:ident, $cmd_variant:ident) => {
        command_handler!($fn_name, $cmd_variant, Sessions, Vec<SessionSummary>);
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
        fn $fn_name(state: tauri::State<AppState>, $($param: $pty,)* ) -> Result<Option<WorkspaceInstance>, String> {
            let cmd = Command::$cmd_variant { $($field),* };
            match execute(cmd, &state) {
                Ok(CommandResult::$some_variant(ws)) => Ok(Some(ws)),
                Ok(CommandResult::Unit(())) => Ok(None),
                Ok(_) => Err(format!(
                    "Unexpected command result variant for {}",
                    stringify!($cmd_variant)
                )),
                Err(e) => Err(e.to_string()),
            }
        }
    };
}

macro_rules! unit_void_return {
    ($cmd_variant:ident { $($field:ident $(: $val:expr)?),* $(,)? }, $state:ident) => {
        match execute(Command::$cmd_variant { $($field $(: $val)?),* }, &$state) {
            Ok(CommandResult::Unit(())) => {}
            Ok(_) => return Err(format!(
                "Unexpected command result variant for {}",
                stringify!($cmd_variant)
            )),
            Err(e) => return Err(e.to_string()),
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
single_return!(save_layout, TemplateSave { name, tree }, name: String, tree: LayoutTree);
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

// ── Non-macro commands ──────────────────────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! The IPC bridge works.", name)
}

#[tauri::command]
fn persist_workspace_tree(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
    tree: LayoutTree,
) -> Result<(), String> {
    unit_void_return!(
        WorkspaceUpdateTree { session_id: session_id.clone(), workspace_id: workspace_id.clone(), tree },
        state
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
    Command::new("/usr/bin/open")
        .arg("-a")
        .arg(&app_name)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to launch {}: {}", app_name, e))?;
    Ok(())
}

#[tauri::command]
fn is_git_repo(path: String) -> bool {
    std::path::Path::new(&path).join(".git").exists()
}

#[tauri::command]
fn pty_spawn(
    state: tauri::State<PtyStore>,
    app: tauri::AppHandle,
    terminal_id: String,
    session_id: String,
) -> Result<PtySpawnResult, String> {
    let pty_command = {
        use tauri_plugin_store::StoreExt;
        let store = app.store("preferences.json").map_err(|e| e.to_string())?;
        store.get("pty_command").and_then(|v| v.as_str().map(String::from))
    };

    let sessions = {
        let app_state = app.state::<AppState>();
        let sessions = app_state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.get_by_id(&session_id).map_err(|e| e.to_string())?
    };

    pty::pty_spawn(
        &state,
        app,
        terminal_id,
        pty_command,
        session_id,
        sessions.working_directory,
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

// ── File-watcher helpers ────────────────────────────────────────────

use std::sync::Arc;

trait WatcherStore {
    fn suppress_watcher(&self) -> bool;
    fn reload_disk(&mut self) -> std::result::Result<(), Box<dyn std::error::Error>>;
}

impl WatcherStore for SessionRegistry {
    fn suppress_watcher(&self) -> bool {
        self.should_suppress_watcher()
    }
    fn reload_disk(&mut self) -> std::result::Result<(), Box<dyn std::error::Error>> {
        self.reload().map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
    }
}

impl WatcherStore for LayoutStore {
    fn suppress_watcher(&self) -> bool {
        self.should_suppress_watcher()
    }
    fn reload_disk(&mut self) -> std::result::Result<(), Box<dyn std::error::Error>> {
        self.reload().map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
    }
}

fn reload_if_changed<T: WatcherStore>(
    store: &Arc<Mutex<T>>,
    label: &str,
) -> bool {
    let mut s = match store.lock() {
        Ok(s) => s,
        Err(_) => return true,
    };
    if s.suppress_watcher() {
        println!("[watcher] Skipping {} reload (internal write)", label);
        false
    } else {
        println!("[watcher] Reloading {} from disk", label);
        if let Err(e) = s.reload_disk() {
            eprintln!("[watcher] Failed to reload {}: {}", label, e);
        }
        true
    }
}

fn handle_watcher_event(
    event: notify::Event,
    sessions: Arc<Mutex<SessionRegistry>>,
    layouts: Arc<Mutex<LayoutStore>>,
    handle: tauri::AppHandle,
) {
    for path in &event.paths {
        let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else { continue };

        match file_name {
            SESSIONS_FILE => {
                if reload_if_changed(&sessions, "sessions") {
                    let _ = handle.emit(EVENT_SESSIONS_CHANGED, ());
                }
            }
            LAYOUTS_FILE => {
                if reload_if_changed(&layouts, "layouts") {
                    let _ = handle.emit(EVENT_LAYOUTS_CHANGED, ());
                }
            }
            _ => {}
        }
    }
}

// ── Application entry point ─────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new().expect("Failed to initialize app state");

    // On startup, any sessions that were left in Running state from a
    // previous run are demoted to Paused so the UI reflects the real
    // process status. The layouts lock is acquired and immediately
    // dropped to ensure the data directory and layouts file are created
    // before the file watcher starts.
    app_state.sessions.lock().expect("lock poisoned")
        .demote_running_to_paused().expect("Failed to demote running sessions");

    drop(app_state.layouts.lock().expect("lock poisoned"));

    let watcher_state: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
    let pty_store = PtyStore::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(ai_agent_workspace_mcp::init())
        .manage(app_state)
        .manage(watcher_state)
        .manage(pty_store)
        .setup(|app| {
            let handle = app.handle().clone();

            ensure_cli_installed();

            let state = app.state::<AppState>();
            let sessions_arc = state.sessions.clone();
            let layouts_arc = state.layouts.clone();

            let mut watcher = notify::recommended_watcher(move |res: std::result::Result<notify::Event, notify::Error>| {
                match res {
                    Ok(event) => handle_watcher_event(
                        event,
                        sessions_arc.clone(),
                        layouts_arc.clone(),
                        handle.clone(),
                    ),
                    Err(e) => {
                        eprintln!("[watcher] Error: {}", e);
                    }
                }
            }).expect("Failed to create file watcher");

            if let Some(data_dir) = dirs::data_dir() {
                let watch_path = data_dir.join(APP_DATA_DIR_NAME);
                println!("[watcher] Watch path: {:?}", watch_path);
                println!("[watcher] Watch path exists: {}", watch_path.exists());
                if watch_path.exists() {
                    watcher.watch(&watch_path.as_path(), RecursiveMode::NonRecursive)
                        .expect("Failed to watch data directory");
                    println!("[watcher] Watching directory successfully");
                } else {
                    println!("[watcher] WARNING: Watch path does not exist!");
                }
            } else {
                println!("[watcher] WARNING: No data directory found!");
            }

            let watcher_lock = app.state::<Mutex<Option<RecommendedWatcher>>>();
            *watcher_lock.lock().expect("lock poisoned") = Some(watcher);

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
            greet,
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
            persist_workspace_tree,
            reset_workspace_to_template,
            open_preferences,
            open_in_app,
            is_git_repo,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
