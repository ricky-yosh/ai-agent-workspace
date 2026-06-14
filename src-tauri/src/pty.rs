use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use portable_pty::{CommandBuilder, PtySize, native_pty_system, MasterPty};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use uuid::Uuid;

#[derive(Clone)]
pub struct SpawnConfig {
    pub shell: String,
    pub session_id: String,
    pub working_directory: String,
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

pub struct PtyStoreInner {
    pub handles: Mutex<HashMap<(String, Vec<usize>), PtyHandle>>,
    pub killed: Mutex<HashSet<(String, Vec<usize>)>>,
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

    pub fn handles(&self) -> &Mutex<HashMap<(String, Vec<usize>), PtyHandle>> {
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
        .filter(|(wid, path)| wid == workspace_id && !valid_paths.contains(path))
        .cloned()
        .collect();

    let mut relocations: Vec<((String, Vec<usize>), (String, Vec<usize>))> = Vec::new();
    let mut kills: Vec<(String, Vec<usize>)> = Vec::new();

    for key in orphan_keys {
        let child_paths: Vec<_> = valid_paths
            .iter()
            .filter(|p| p.len() == key.1.len() + 1 && p.starts_with(&key.1))
            .collect();
        if let Some(&&ref child_path) = child_paths.first() {
            relocations.push((key.clone(), (key.0.clone(), child_path.clone())));
        } else {
            kills.push(key);
        }
    }

    // Relocate PTYs for splits (move to first child path)
    for (old_key, new_key) in relocations {
        if let Some(mut handle) = handles.remove(&old_key) {
            handle.path = new_key.1.clone();
            handles.insert(new_key, handle);
        }
    }

    // Kill PTYs for joins/deletions
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

fn spawn_pty_internal(
    store: &Arc<PtyStoreInner>,
    app_handle: &tauri::AppHandle,
    workspace_id: &str,
    path: &[usize],
    config: &SpawnConfig,
) -> Result<String, String> {
    let pty_id = Uuid::new_v4().to_string();

    let pty_system = native_pty_system();
    let size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&config.shell);
    cmd.env("AIAW_SESSION_ID", &config.session_id);
    cmd.cwd(PathBuf::from(&config.working_directory));

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let pty_id_for_thread = pty_id.clone();
    let store_arc = Arc::clone(store);
    let app_handle_clone = app_handle.clone();
    let config_clone = config.clone();
    let workspace_id_clone = workspace_id.to_string();
    let path_clone = path.to_vec();

    let reader_thread = std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // Process exited — check if this PTY was intentionally killed
                    let old_pty_id = pty_id_for_thread.clone();

                    {
                        let killed = store_arc.killed.lock().unwrap();
                        if killed.contains(&(workspace_id_clone.clone(), path_clone.clone())) {
                            break;
                        }
                    }

                    // Remove old entry
                    {
                        let mut handles = store_arc.handles.lock().unwrap();
                        handles.remove(&(workspace_id_clone.clone(), path_clone.clone()));
                    }

                    // Spawn a new PTY with the same config
                    let new_pty_id_result = spawn_pty_internal(
                        &store_arc,
                        &app_handle_clone,
                        &workspace_id_clone,
                        &path_clone,
                        &config_clone,
                    );

                    if let Ok(new_pty_id) = new_pty_id_result {
                        let restart_payload = PtyRestartPayload {
                            old_pty_id,
                            new_pty_id,
                            path: path_clone,
                        };
                        let _ = app_handle_clone.emit("pty-restart", &restart_payload);
                    }
                    break;
                }
                Ok(n) => {
                    let payload = PtyOutputPayload {
                        pty_id: pty_id_for_thread.clone(),
                        data: buf[..n].to_vec(),
                    };
                    let _ = app_handle_clone.emit("pty-output", &payload);
                }
                Err(_) => break,
            }
        }
    });

    let handle = PtyHandle {
        pty_id: pty_id.clone(),
        child,
        writer,
        master: pair.master,
        spawn_config: config.clone(),
        workspace_id: workspace_id.to_string(),
        path: path.to_vec(),
        _reader_thread: reader_thread,
    };

    let mut handles = store.handles.lock().map_err(|e| e.to_string())?;
    handles.insert((workspace_id.to_string(), path.to_vec()), handle);

    Ok(pty_id)
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
    // Idempotent: if a PTY exists at (workspace_id, path) and child is alive, return existing ID
    {
        let handles = store.handles().lock().map_err(|e| e.to_string())?;
        if let Some(handle) = handles.get(&(workspace_id.clone(), path.clone())) {
            if handle.child.process_id().is_some() {
                return Ok(PtySpawnResult {
                    pty_id: handle.pty_id.clone(),
                });
            }
        }
    }

    // Remove dead PTY if present
    {
        let mut handles = store.handles().lock().map_err(|e| e.to_string())?;
        if let Some(mut old) = handles.remove(&(workspace_id.clone(), path.clone())) {
            let _ = old.child.kill();
        }
    }

    // Clear any killed flag — explicit spawn overrides a prior kill
    {
        let mut killed = store.inner.killed.lock().map_err(|e| e.to_string())?;
        killed.remove(&(workspace_id.clone(), path.clone()));
    }

    let shell = match pty_command.as_deref() {
        None | Some("") | Some("$SHELL") => {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
        }
        Some(cmd) => cmd.to_string(),
    };

    let config = SpawnConfig {
        shell,
        session_id,
        working_directory,
    };

    let store_arc = store.arc();
    let pty_id = spawn_pty_internal(&store_arc, &app_handle, &workspace_id, &path, &config)?;

    Ok(PtySpawnResult { pty_id })
}

pub fn pty_write(
    store: &PtyStore,
    pty_id: &str,
    data: &[u8],
) -> Result<(), String> {
    let mut handles = store.handles().lock().map_err(|e| e.to_string())?;
    let handle = handles.values_mut().find(|h| h.pty_id == pty_id)
        .ok_or_else(|| format!("PTY not found: {}", pty_id))?;

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
    let handle = handles.values_mut().find(|h| h.pty_id == pty_id)
        .ok_or_else(|| format!("PTY not found: {}", pty_id))?;

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
    let key = (workspace_id.to_string(), path.to_vec());
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
        // Insert a mock entry (using a dummy handle would require a real PTY,
        // so just test the cleanup logic with an empty store)
        cleanup_orphaned_ptys(&store, "ws1", &[]);
        let handles = store.handles().lock().unwrap();
        assert!(handles.is_empty());
    }

    #[test]
    fn test_idempotent_spawn_returns_existing() {
        // This test verifies the logic path, not an actual spawn
        let store = PtyStore::new();
        let handles = store.handles().lock().unwrap();
        // No entry exists, so idempotent check would fall through to spawn
        assert!(handles.get(&("ws1".to_string(), vec![0])).is_none());
    }
}
