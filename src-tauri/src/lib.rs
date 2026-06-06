mod session_registry;
mod layout_store;
mod task_store;

use std::sync::Mutex;
use session_registry::{Session, SessionRegistry, SessionSummary};
use layout_store::{Layout, LayoutStore, LayoutTree};
use task_store::{Task, TaskInput};

pub struct AppState {
    registry: Mutex<SessionRegistry>,
    layout_store: Mutex<LayoutStore>,
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
    registry.save().map_err(|e| e.to_string())?;

    if session.active_layout_id.is_none() {
        let mut store = state.layout_store.lock().map_err(|e| e.to_string())?;
        let default_tree = LayoutStore::default_layout();
        let layout = store.save_layout("Default", default_tree).map_err(|e| e.to_string())?;
        store.save().map_err(|e| e.to_string())?;
        drop(store);

        registry
            .set_active_layout_id(&session_id, Some(layout.id))
            .map_err(|e| e.to_string())?;
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
fn set_active_layout(
    state: tauri::State<AppState>,
    session_id: String,
    layout_id: String,
) -> Result<(), String> {
    let mut registry = state.registry.lock().map_err(|e| e.to_string())?;
    let store = state.layout_store.lock().map_err(|e| e.to_string())?;
    // Verify the layout exists
    store.get_layout(&layout_id).map_err(|e| e.to_string())?;
    drop(store);
    registry
        .set_active_layout_id(&session_id, Some(layout_id))
        .map_err(|e| e.to_string())?;
    registry.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn update_layout_tree(
    state: tauri::State<AppState>,
    layout_id: String,
    tree: LayoutTree,
) -> Result<(), String> {
    let mut store = state.layout_store.lock().map_err(|e| e.to_string())?;
    store.update_tree(&layout_id, tree).map_err(|e| e.to_string())?;
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_active_layout(
    state: tauri::State<AppState>,
    session_id: String,
) -> Result<Option<Layout>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry
        .list()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|s| s.id == session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    let layout_id = match session.active_layout_id {
        Some(id) => id,
        None => return Ok(None),
    };
    let store = state.layout_store.lock().map_err(|e| e.to_string())?;
    match store.get_layout(&layout_id) {
        Ok(layout) => Ok(Some(layout)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn get_tasks(state: tauri::State<AppState>, session_id: String) -> Result<Vec<Task>, String> {
    let registry = state.registry.lock().map_err(|e| e.to_string())?;
    let session = registry.get_by_id(&session_id).map_err(|e| e.to_string())?;
    drop(registry);
    let tasks_path = std::path::Path::new(&session.working_directory).join("tasks.json");
    task_store::read_tasks(&tasks_path)
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
    task_store::add_task(&tasks_path, task)
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
    task_store::update_task(&tasks_path, task_id, description, status)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut registry = SessionRegistry::new().expect("Failed to initialize session registry");
    registry.demote_running_to_paused().expect("Failed to demote running sessions");
    let layout_store = LayoutStore::new().expect("Failed to initialize layout store");
    let app_state = AppState {
        registry: Mutex::new(registry),
        layout_store: Mutex::new(layout_store),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            set_active_layout,
            get_active_layout,
            update_layout_tree,
            get_tasks,
            add_task,
            update_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
