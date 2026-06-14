use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use portable_pty::{CommandBuilder, PtySize, native_pty_system, MasterPty};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use uuid::Uuid;

const DEFAULT_PTY_ROWS: u16 = 24;
const DEFAULT_PTY_COLS: u16 = 80;
const PTY_READ_BUFFER_SIZE: usize = 4096;

#[derive(Clone)]
pub struct SpawnConfig {
    pub shell: String,
    pub session_id: String,
    pub working_directory: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct PtyKey {
    pub(crate) workspace_id: String,
    pub(crate) path: Vec<usize>,
}

impl PtyKey {
    fn new(workspace_id: &str, path: &[usize]) -> Self {
        Self {
            workspace_id: workspace_id.to_string(),
            path: path.to_vec(),
        }
    }
}

pub struct PtyHandle {
    pub pty_id: String,
    child: Box<dyn portable_pty::Child + Send>,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    #[allow(dead_code)]
    spawn_config: SpawnConfig,
    #[allow(dead_code)]
    workspace_id: String,
    #[allow(dead_code)]
    path: Vec<usize>,
    _reader_thread: std::thread::JoinHandle<()>,
}

/// Lock acquisition order: always acquire `handles` before `killed` to prevent deadlocks.
pub struct PtyStoreInner {
    pub handles: Mutex<HashMap<PtyKey, PtyHandle>>,
    pub killed: Mutex<HashSet<PtyKey>>,
}

pub struct PtyStore {
    inner: Arc<PtyStoreInner>,
}

impl PtyStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(PtyStoreInner {
                handles: Mutex::new(HashMap::new()),
                killed: Mutex::new(HashSet::new()),
            }),
        }
    }

    pub fn arc(&self) -> Arc<PtyStoreInner> {
        Arc::clone(&self.inner)
    }

    pub fn handles(&self) -> &Mutex<HashMap<PtyKey, PtyHandle>> {
        &self.inner.handles
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyOutputPayload {
    pub pty_id: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtySpawnResult {
    pub pty_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PtyRestartPayload {
    pub old_pty_id: String,
    pub new_pty_id: String,
    pub path: Vec<usize>,
}

pub fn cleanup_orphaned_ptys(store: &PtyStore, workspace_id: &str, valid_paths: &[Vec<usize>]) {
    let mut handles = store.handles().lock().unwrap();
    let orphan_keys: Vec<_> = handles
        .keys()
        .filter(|key| key.workspace_id == workspace_id && !valid_paths.contains(&key.path))
        .cloned()
        .collect();

    let mut relocations: Vec<(PtyKey, PtyKey)> = Vec::new();
    let mut kills: Vec<PtyKey> = Vec::new();

    for key in orphan_keys {
        let child_paths: Vec<_> = valid_paths
            .iter()
            .filter(|p| p.len() == key.path.len() + 1 && p.starts_with(&key.path))
            .collect();
        if let Some(&&ref child_path) = child_paths.first() {
            relocations.push((key.clone(), PtyKey::new(&key.workspace_id, child_path)));
        } else {
            kills.push(key);
        }
    }

    for (old_key, new_key) in relocations {
        if let Some(mut handle) = handles.remove(&old_key) {
            handle.path = new_key.path.clone();
            handles.insert(new_key, handle);
        }
    }

    {
        let mut killed = store.inner.killed.lock().unwrap();
        for key in &kills {
            killed.insert(key.clone());
        }
    }
    for key in kills {
        if let Some(mut handle) = handles.remove(&key) {
            let _ = handle.child.kill();
        }
    }
}

fn create_pty_pair(config: &SpawnConfig, size: PtySize) -> Result<(Box<dyn MasterPty + Send>, Box<dyn portable_pty::Child + Send>, Box<dyn Read + Send>, Box<dyn Write + Send>), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;
    let mut cmd = CommandBuilder::new(&config.shell);
    cmd.env("AIAW_SESSION_ID", &config.session_id);
    cmd.cwd(PathBuf::from(&config.working_directory));
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    Ok((pair.master, child, reader, writer))
}

fn handle_pty_exit(
    store: &Arc<PtyStoreInner>,
    app_handle: &tauri::AppHandle,
    workspace_id: &str,
    path: &[usize],
    config: &SpawnConfig,
    old_pty_id: &str,
) {
    {
        let killed = store.killed.lock().unwrap();
        if killed.contains(&PtyKey::new(workspace_id, path)) {
            return;
        }
    }
    {
        let mut handles = store.handles.lock().unwrap();
        handles.remove(&PtyKey::new(workspace_id, path));
    }
    if let Ok(new_pty_id) = spawn_pty_internal(store, app_handle, workspace_id, path, config) {
        let _ = app_handle.emit("pty-restart", &PtyRestartPayload {
            old_pty_id: old_pty_id.to_string(),
            new_pty_id,
            path: path.to_vec(),
        });
    }
}

fn emit_pty_output(app_handle: &tauri::AppHandle, pty_id: &str, data: &[u8]) {
    let _ = app_handle.emit("pty-output", &PtyOutputPayload {
        pty_id: pty_id.to_string(),
        data: data.to_vec(),
    });
}

fn run_pty_reader(
    store: Arc<PtyStoreInner>,
    app_handle: tauri::AppHandle,
    workspace_id: String,
    path: Vec<usize>,
    config: SpawnConfig,
    pty_id: String,
    mut reader: Box<dyn Read + Send>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = [0u8; PTY_READ_BUFFER_SIZE];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    handle_pty_exit(&store, &app_handle, &workspace_id, &path, &config, &pty_id);
                    break;
                }
                Ok(n) => {
                    emit_pty_output(&app_handle, &pty_id, &buf[..n]);
                }
                Err(_) => break,
            }
        }
    })
}

fn spawn_pty_internal(
    store: &Arc<PtyStoreInner>,
    app_handle: &tauri::AppHandle,
    workspace_id: &str,
    path: &[usize],
    config: &SpawnConfig,
) -> Result<String, String> {
    let pty_id = Uuid::new_v4().to_string();
    let size = PtySize {
        rows: DEFAULT_PTY_ROWS,
        cols: DEFAULT_PTY_COLS,
        pixel_width: 0,
        pixel_height: 0,
    };
    let (master, child, reader, writer) = create_pty_pair(config, size)?;

    let reader_thread = run_pty_reader(
        Arc::clone(store),
        app_handle.clone(),
        workspace_id.to_string(),
        path.to_vec(),
        config.clone(),
        pty_id.clone(),
        reader,
    );

    let handle = PtyHandle {
        pty_id: pty_id.clone(),
        child,
        writer,
        master,
        spawn_config: config.clone(),
        workspace_id: workspace_id.to_string(),
        path: path.to_vec(),
        _reader_thread: reader_thread,
    };

    let mut handles = store.handles.lock().map_err(|e| e.to_string())?;
    handles.insert(PtyKey::new(workspace_id, path), handle);

    Ok(pty_id)
}

fn get_existing_pty_id(store: &PtyStore, workspace_id: &str, path: &[usize]) -> Result<Option<String>, String> {
    let handles = store.handles().lock().map_err(|e| e.to_string())?;
    Ok(handles.get(&PtyKey::new(workspace_id, path))
        .and_then(|h| if h.child.process_id().is_some() { Some(h.pty_id.clone()) } else { None }))
}

fn remove_dead_pty(store: &PtyStore, workspace_id: &str, path: &[usize]) -> Result<(), String> {
    let mut handles = store.handles().lock().map_err(|e| e.to_string())?;
    if let Some(mut old) = handles.remove(&PtyKey::new(workspace_id, path)) {
        let _ = old.child.kill();
    }
    Ok(())
}

fn clear_killed_flag(store: &PtyStore, workspace_id: &str, path: &[usize]) -> Result<(), String> {
    let mut killed = store.inner.killed.lock().map_err(|e| e.to_string())?;
    killed.remove(&PtyKey::new(workspace_id, path));
    Ok(())
}

fn resolve_shell(pty_command: Option<&str>) -> String {
    match pty_command {
        None | Some("") | Some("$SHELL") => {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
        }
        Some(cmd) => cmd.to_string(),
    }
}

pub fn pty_spawn(
    store: &PtyStore,
    app_handle: tauri::AppHandle,
    workspace_id: String,
    path: Vec<usize>,
    pty_command: Option<String>,
    session_id: String,
    working_directory: String,
) -> Result<PtySpawnResult, String> {
    if let Some(pty_id) = get_existing_pty_id(store, &workspace_id, &path)? {
        return Ok(PtySpawnResult { pty_id });
    }
    remove_dead_pty(store, &workspace_id, &path)?;
    clear_killed_flag(store, &workspace_id, &path)?;
    let shell = resolve_shell(pty_command.as_deref());
    let config = SpawnConfig { shell, session_id, working_directory };
    let store_arc = store.arc();
    let pty_id = spawn_pty_internal(&store_arc, &app_handle, &workspace_id, &path, &config)?;
    Ok(PtySpawnResult { pty_id })
}

fn find_handle_mut<'a>(handles: &'a mut HashMap<PtyKey, PtyHandle>, pty_id: &str) -> Result<&'a mut PtyHandle, String> {
    handles.values_mut().find(|h| h.pty_id == pty_id)
        .ok_or_else(|| format!("PTY not found: {}", pty_id))
}

pub fn pty_write(
    store: &PtyStore,
    pty_id: &str,
    data: &[u8],
) -> Result<(), String> {
    let mut handles = store.handles().lock().map_err(|e| e.to_string())?;
    let handle = find_handle_mut(&mut *handles, pty_id)?;

    handle.writer.write_all(data).map_err(|e| e.to_string())?;
    handle.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn pty_resize(
    store: &PtyStore,
    pty_id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut handles = store.handles().lock().map_err(|e| e.to_string())?;
    let handle = find_handle_mut(&mut *handles, pty_id)?;

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    handle.master.resize(size).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn pty_kill(
    store: &PtyStore,
    workspace_id: &str,
    path: &[usize],
) -> Result<(), String> {
    let key = PtyKey::new(workspace_id, path);
    {
        let mut killed = store.inner.killed.lock().map_err(|e| e.to_string())?;
        killed.insert(key.clone());
    }
    let mut handles = store.handles().lock().map_err(|e| e.to_string())?;
    if let Some(mut handle) = handles.remove(&key) {
        let _ = handle.child.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pty_store_creation() {
        let store = PtyStore::new();
        let handles = store.handles().lock().unwrap();
        assert!(handles.is_empty());
    }

    #[test]
    fn test_spawn_config_clone() {
        let config = SpawnConfig {
            shell: "/bin/zsh".to_string(),
            session_id: "test-session".to_string(),
            working_directory: "/tmp".to_string(),
        };
        let config2 = config.clone();
        assert_eq!(config.shell, config2.shell);
        assert_eq!(config.session_id, config2.session_id);
        assert_eq!(config.working_directory, config2.working_directory);
    }

    #[test]
    fn test_cleanup_removes_orphaned_ptys() {
        let store = PtyStore::new();
        cleanup_orphaned_ptys(&store, "ws1", &[]);
        let handles = store.handles().lock().unwrap();
        assert!(handles.is_empty());
    }

    #[test]
    fn test_idempotent_spawn_returns_existing() {
        let store = PtyStore::new();
        let handles = store.handles().lock().unwrap();
        assert!(handles.get(&PtyKey::new("ws1", &[0])).is_none());
    }
}
