use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri::menu::*;
use ai_agent_workspace_commands::{
    AppState, Command, CommandResult, execute,
};
use ai_agent_workspace_core::{
    Session, SessionSummary, WorkspaceInstance,
    Layout, LayoutTree, LayoutNode,
};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};

mod pty;
use pty::{PtyStore, PtySpawnResult, cleanup_orphaned_ptys};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! The IPC bridge works.", name)
}

#[tauri::command]
fn create_session(
    state: tauri::State<AppState>,
    working_dir: String,
    name: String,
) -> Result<Session, String> {
    let cmd = Command::SessionCreate { working_dir, name };
    match execute(cmd, &state) {
        Ok(CommandResult::Session(s)) => Ok(s),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn list_sessions(state: tauri::State<AppState>) -> Result<Vec<SessionSummary>, String> {
    match execute(Command::SessionList, &state) {
        Ok(CommandResult::Sessions(s)) => Ok(s),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn rename_session(
    state: tauri::State<AppState>,
    session_id: String,
    new_name: String,
) -> Result<Session, String> {
    let cmd = Command::SessionRename { session_id, new_name };
    match execute(cmd, &state) {
        Ok(CommandResult::Session(s)) => Ok(s),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_session(state: tauri::State<AppState>, session_id: String) -> Result<(), String> {
    let cmd = Command::SessionDelete { session_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn open_session(state: tauri::State<AppState>, session_id: String) -> Result<Session, String> {
    let cmd = Command::SessionOpen { session_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Session(s)) => Ok(s),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn close_session(state: tauri::State<AppState>, session_id: String) -> Result<Session, String> {
    let cmd = Command::SessionClose { session_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Session(s)) => Ok(s),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_all_sessions(state: tauri::State<AppState>) -> Result<(), String> {
    match execute(Command::SessionDeleteAll, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn list_layouts(state: tauri::State<AppState>) -> Result<Vec<Layout>, String> {
    match execute(Command::TemplateList, &state) {
        Ok(CommandResult::Layouts(l)) => Ok(l),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_layout(
    state: tauri::State<AppState>,
    name: String,
    tree: LayoutTree,
) -> Result<Layout, String> {
    let cmd = Command::TemplateSave { name, tree };
    match execute(cmd, &state) {
        Ok(CommandResult::Layout(l)) => Ok(l),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_layout(state: tauri::State<AppState>, layout_id: String) -> Result<(), String> {
    let cmd = Command::TemplateDelete { layout_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn rename_layout(
    state: tauri::State<AppState>,
    layout_id: String,
    new_name: String,
) -> Result<(), String> {
    let cmd = Command::TemplateRename { layout_id, new_name };
    match execute(cmd, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_all_templates(state: tauri::State<AppState>) -> Result<(), String> {
    match execute(Command::TemplateDeleteAll, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_session_workspaces(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<Vec<WorkspaceInstance>, String> {
    let cmd = Command::WorkspaceList { session_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Workspaces(w)) => Ok(w),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn get_active_workspace(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<Option<WorkspaceInstance>, String> {
    let cmd = Command::WorkspaceGetActive { session_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Workspace(ws)) => Ok(Some(ws)),
        Ok(CommandResult::Unit(())) => Ok(None),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn add_workspace(
    state: tauri::State<AppState>,
    session_id: String,
    template_id: String,
) -> Result<WorkspaceInstance, String> {
    let cmd = Command::WorkspaceAdd { session_id, template_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Workspace(w)) => Ok(w),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn remove_workspace(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
) -> Result<(), String> {
    let cmd = Command::WorkspaceRemove { session_id, workspace_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn rename_workspace(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
    new_name: String,
) -> Result<(), String> {
    let cmd = Command::WorkspaceRename { session_id, workspace_id, new_name };
    match execute(cmd, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn set_active_workspace(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
) -> Result<(), String> {
    let cmd = Command::WorkspaceSetActive { session_id, workspace_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

fn collect_terminal_paths(node: &LayoutNode, prefix: &mut Vec<usize>) -> Vec<Vec<usize>> {
    let mut result = Vec::new();
    match node {
        LayoutNode::Panel { panel_type } => {
            if panel_type == "terminal" {
                result.push(prefix.clone());
            }
        }
        LayoutNode::Split { children, .. } => {
            for (i, child) in children.iter().enumerate() {
                prefix.push(i);
                result.extend(collect_terminal_paths(child, prefix));
                prefix.pop();
            }
        }
    }
    result
}

#[tauri::command]
fn update_workspace_tree(
    state: tauri::State<AppState>,
    pty_store: tauri::State<PtyStore>,
    session_id: String,
    workspace_id: String,
    tree: LayoutTree,
) -> Result<(), String> {
    let terminal_paths = collect_terminal_paths(&tree.tree, &mut Vec::new());

    let cmd = Command::WorkspaceUpdateTree {
        session_id,
        workspace_id: workspace_id.clone(),
        tree,
    };
    match execute(cmd, &state) {
        Ok(CommandResult::Unit(())) => {}
        Ok(_) => unreachable!(),
        Err(e) => return Err(e.to_string()),
    }

    cleanup_orphaned_ptys(&pty_store, &workspace_id, &terminal_paths);

    Ok(())
}

#[tauri::command]
fn reset_workspace_to_template(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
) -> Result<WorkspaceInstance, String> {
    let cmd = Command::WorkspaceReset { session_id, workspace_id };
    match execute(cmd, &state) {
        Ok(CommandResult::Workspace(w)) => Ok(w),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn open_preferences(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.webview_windows().get("preferences") {
        let _ = window.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app, "preferences", tauri::WebviewUrl::App("preferences.html".into()))
        .title("Preferences")
        .inner_size(520.0, 400.0)
        .resizable(false)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
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
    workspace_id: String,
    path: Vec<usize>,
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
        workspace_id,
        path,
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
    workspace_id: String,
    path: Vec<usize>,
) -> Result<(), String> {
    pty::pty_kill(&state, &workspace_id, &path)
}

const CLI_NAME: &str = "aiaw-mcp-server";
const CLI_INSTALL_PATH: &str = "/usr/local/bin/aiaw-mcp-server";

fn ensure_cli_installed(_app_handle: &tauri::AppHandle) {
    let target = std::path::Path::new(CLI_INSTALL_PATH);

    // Already installed and valid — nothing to do
    if target.exists() || target.is_symlink() {
        if let Ok(link) = std::fs::read_link(target) {
            if link.exists() {
                println!("[cli] {} already installed at {}", CLI_NAME, CLI_INSTALL_PATH);
                return;
            }
        }
    }

    // Locate the binary inside the .app bundle's Resources/
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[cli] Cannot locate app binary: {}", e);
            return;
        }
    };
    let resource = exe
        .parent().and_then(|p| p.parent()) // MacOS/ → Contents/
        .map(|p| p.join("Resources").join(CLI_NAME));

    let resource = match resource {
        Some(r) if r.exists() => r,
        _ => {
            println!("[cli] {} not found in app bundle — skipping CLI install (dev mode?)", CLI_NAME);
            return;
        }
    };

    // Attempt symlink
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new().expect("Failed to initialize app state");

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

            ensure_cli_installed(&handle);

            let state = app.state::<AppState>();
            let sessions_arc = state.sessions.clone();
            let layouts_arc = state.layouts.clone();

            let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
                match &res {
                    Ok(event) => {
                        for path in &event.paths {
                            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                                if file_name == "sessions.json" {
                                    if let Ok(mut sessions) = sessions_arc.lock() {
                                        if sessions.should_suppress_watcher() {
                                            println!("[watcher] Skipping sessions reload (internal write)");
                                            continue;
                                        }
                                        println!("[watcher] Reloading sessions from disk");
                                        if let Err(e) = sessions.reload() {
                                            eprintln!("[watcher] Failed to reload sessions: {}", e);
                                        }
                                    }
                                    let _ = handle.emit("sessions-changed", ());
                                } else if file_name == "layouts.json" {
                                    if let Ok(mut layouts) = layouts_arc.lock() {
                                        if layouts.should_suppress_watcher() {
                                            println!("[watcher] Skipping layouts reload (internal write)");
                                            continue;
                                        }
                                        println!("[watcher] Reloading layouts from disk");
                                        if let Err(e) = layouts.reload() {
                                            eprintln!("[watcher] Failed to reload layouts: {}", e);
                                        }
                                    }
                                    let _ = handle.emit("layouts-changed", ());
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[watcher] Error: {}", e);
                    }
                }
            }).expect("Failed to create file watcher");

            if let Some(data_dir) = dirs::data_dir() {
                let watch_path = data_dir.join("AI Agent Workspace");
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
                    if let Some(window) = app.webview_windows().get("preferences") {
                        let _ = window.set_focus();
                    } else {
                        let _ = tauri::WebviewWindowBuilder::new(
                            app,
                            "preferences",
                            tauri::WebviewUrl::App("preferences.html".into()),
                        )
                        .title("Preferences")
                        .inner_size(520.0, 480.0)
                        .resizable(false)
                        .build();
                    }
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
            update_workspace_tree,
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
