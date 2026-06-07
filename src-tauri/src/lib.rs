mod session_registry;
mod layout_store;
mod task_store;

use std::sync::Mutex;
use session_registry::{Session, SessionRegistry, SessionSummary, WorkspaceInstance};
use layout_store::{Layout, LayoutStore, LayoutTree};
use task_store::{Task, TaskInput, TaskStore};

pub struct AppState {
    registry: Mutex<SessionRegistry>,
    layout_store: Mutex<LayoutStore>,
    task_store: Mutex<TaskStore>,
}

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
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry.create(&working_dir, &name).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
fn list_sessions(state: tauri::State<AppState>) -> Result<Vec<SessionSummary>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.list().map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_session(
    state: tauri::State<AppState>,
    session_id: String,
    new_name: String,
) -> Result<Session, String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry
        .rename(&session_id, &new_name)
        .map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
fn delete_session(state: tauri::State<AppState>, session_id: String) -> Result<(), String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.delete(&session_id).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn open_session(state: tauri::State<AppState>, session_id: String) -> Result<Session, String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry.open(&session_id).map_err(|e| e.to_string())?;

    if session.workspaces.is_empty() {
        let mut store = state.layout_store.lock().map_err(|e| e.to_string())?;
        let layouts = store.list_layouts().map_err(|e| e.to_string())?;
        let (template_id, template_name, default_tree) = if let Some(first) = layouts.first() {
            (first.id.clone(), first.name.clone(), first.tree.clone())
        } else {
            let default_tree = LayoutStore::default_layout();
            let layout = store.save_layout("General", default_tree).map_err(|e| e.to_string())?;
            store.save().map_err(|e| e.to_string())?;
            (layout.id, layout.name, layout.tree)
        };
        drop(store);

        registry
            .add_workspace(&session_id, &template_id, &template_name, default_tree)
            .map_err(|e| e.to_string())?;
        registry.save().map_err(|e| e.to_string())?;
    } else {
        registry.save().map_err(|e| e.to_string())?;
    }

    registry.get_by_id(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn close_session(state: tauri::State<AppState>, session_id: String) -> Result<Session, String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry.close(&session_id).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
fn list_layouts(state: tauri::State<AppState>) -> Result<Vec<Layout>, String> {
    let store = state.layout_store.lock().map_err(|e| e.to_string())?;
    store.list_layouts().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_layout(
    state: tauri::State<AppState>,
    name: String,
    tree: LayoutTree,
) -> Result<Layout, String> {
    let mut store = state.layout_store.lock().map_err(|e| e.to_string())?;
    let layout = store.save_layout(&name, tree).map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())?;
    Ok(layout)
}

#[tauri::command]
fn delete_layout(
    state: tauri::State<AppState>,
    layout_id: String,
) -> Result<(), String> {
    let mut store = state.layout_store.lock().map_err(|e| e.to_string())?;
    store.delete_layout(&layout_id).map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_layout(
    state: tauri::State<AppState>,
    layout_id: String,
    new_name: String,
) -> Result<(), String> {
    let mut store = state.layout_store.lock().map_err(|e| e.to_string())?;
    store.rename_layout(&layout_id, &new_name).map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_workspaces(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<Vec<WorkspaceInstance>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    Ok(registry.get_workspaces(&session_id).map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
fn get_active_workspace(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<Option<WorkspaceInstance>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    match registry.get_active_workspace(&session_id) {
        Ok(ws) => Ok(Some(ws)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn add_workspace(
    state: tauri::State<AppState>,
    session_id: String,
    template_id: String,
) -> Result<WorkspaceInstance, String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    let store = state.layout_store.lock().map_err(|e| e.to_string())?;
    let template = store.get_layout(&template_id).map_err(|e| e.to_string())?;
    drop(store);
    let ws = registry.add_workspace(&session_id, &template_id, &template.name, template.tree).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())?;
    Ok(ws)
}

#[tauri::command]
fn remove_workspace(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
) -> Result<(), String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.remove_workspace(&session_id, &workspace_id).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_workspace(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
    new_name: String,
) -> Result<(), String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.rename_workspace(&session_id, &workspace_id, &new_name).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_active_workspace(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
) -> Result<(), String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.set_active_workspace(&session_id, &workspace_id).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn update_workspace_tree(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
    tree: LayoutTree,
) -> Result<(), String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.update_workspace_tree(&session_id, &workspace_id, tree).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn reset_workspace_to_template(
    state: tauri::State<AppState>,
    session_id: String,
    workspace_id: String,
) -> Result<WorkspaceInstance, String> {
    let template_id = {
        let registry = state.registry.lock().map_err(|e| e.to_string())?;
        registry.get_workspaces(&session_id).map_err(|e| e.to_string())?
            .iter().find(|w| w.id == workspace_id)
            .ok_or_else(|| "Workspace not found".to_string())?
            .template_id.clone()
    };
    let store = state.layout_store.lock().map_err(|e| e.to_string())?;
    let default_tree = store.get_layout(&template_id).map_err(|e| e.to_string())?.tree;
    drop(store);
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    registry.reset_workspace_to_template(&session_id, &workspace_id, default_tree).map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())?;
    registry.get_workspaces(&session_id).map_err(|e| e.to_string())?
        .iter().find(|w| w.id == workspace_id)
        .cloned()
        .ok_or_else(|| "Workspace not found".to_string())
}

#[tauri::command]
fn get_tasks(state: tauri::State<AppState>, session_id: String) -> Result<Vec<Task>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry.get_by_id(&session_id).map_err(|e| e.to_string())?;
    drop(registry);
    let tasks_path = std::path::Path::new(&session.working_directory).join("tasks.json");
    let store = state.task_store.lock().map_err(|e| e.to_string())?;
    store.read_tasks(&tasks_path)
}

#[tauri::command]
fn add_task(
    state: tauri::State<AppState>,
    session_id: String,
    task: TaskInput,
) -> Result<Task, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry.get_by_id(&session_id).map_err(|e| e.to_string())?;
    drop(registry);
    let tasks_path = std::path::Path::new(&session.working_directory).join("tasks.json");
    let store = state.task_store.lock().map_err(|e| e.to_string())?;
    store.add_task(&tasks_path, task)
}

#[tauri::command]
fn update_task(
    state: tauri::State<AppState>,
    session_id: String,
    task_id: u32,
    description: String,
    status: String,
) -> Result<Task, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry.get_by_id(&session_id).map_err(|e| e.to_string())?;
    drop(registry);
    let tasks_path = std::path::Path::new(&session.working_directory).join("tasks.json");
    let store = state.task_store.lock().map_err(|e| e.to_string())?;
    store.update_task(&tasks_path, task_id, description, status)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut registry = SessionRegistry::new().expect("Failed to initialize session registry");
    registry.demote_running_to_paused().expect("Failed to demote running sessions");
    let mut layout_store = LayoutStore::new().expect("Failed to initialize layout store");
    if layout_store.list_layouts().map_or(true, |l| l.is_empty()) {
        let default_tree = LayoutStore::default_layout();
        layout_store.save_layout("Default", default_tree).expect("Failed to seed default layout");
        layout_store.save().expect("Failed to save seeded layout");
    }
    let task_store = TaskStore::new();
    let app_state = AppState {
        registry: Mutex::new(registry),
        layout_store: Mutex::new(layout_store),
        task_store: Mutex::new(task_store),
    };

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
            get_tasks,
            add_task,
            update_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
