use ai_agent_workspace_commands::{
    AppState, Command, CommandResult, execute,
};
use ai_agent_workspace_core::{
    Session, SessionSummary, WorkspaceInstance,
    Layout, LayoutStore, LayoutTree,
};

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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
