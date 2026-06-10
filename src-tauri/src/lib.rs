use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri::menu::*;
use ai_agent_workspace_commands::{
    AppState, Command, CommandResult, execute,
};
use ai_agent_workspace_core::{
    Session, SessionSummary, WorkspaceInstance,
    Layout, LayoutStore, LayoutTree,
};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};

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

#[tauri::command]
fn update_workspace_tree(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
    tree: LayoutTree,
) -> Result<(), String> {
    let cmd = Command::WorkspaceUpdateTree { session_id, workspace_id, tree };
    match execute(cmd, &state) {
        Ok(CommandResult::Unit(())) => Ok(()),
        Ok(_) => unreachable!(),
        Err(e) => Err(e.to_string()),
    }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new().expect("Failed to initialize app state");

    app_state.sessions.lock().expect("lock poisoned")
        .demote_running_to_paused().expect("Failed to demote running sessions");

    let mut layouts = app_state.layouts.lock().expect("lock poisoned");
    if layouts.list_layouts().map_or(true, |l| l.is_empty()) {
        let default_tree = LayoutStore::default_layout();
        layouts.save_layout("Default", default_tree).expect("Failed to seed default layout");
        layouts.save().expect("Failed to save seeded layout");
    }
    drop(layouts);

    let watcher_state: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(ai_agent_workspace_mcp::init())
        .manage(app_state)
        .manage(watcher_state)
        .setup(|app| {
            let handle = app.handle().clone();
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
                        .inner_size(520.0, 400.0)
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
            list_layouts,
            save_layout,
            delete_layout,
            rename_layout,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
