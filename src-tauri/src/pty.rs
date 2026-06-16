use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
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

pub struct PtyHandle {
    pub pty_id: String,
    child: Box<dyn portable_pty::Child + Send>,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    #[allow(dead_code)]
    spawn_config: SpawnConfig,
    _reader_thread: std::thread::JoinHandle<()>,
    is_killed: AtomicBool,
}

pub struct PtyStoreInner {
    pub handles: Mutex<HashMap<String, PtyHandle>>,
}

pub struct PtyStore {
    inner: Arc<PtyStoreInner>,
}

impl PtyStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(PtyStoreInner {
                handles: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub fn arc(&self) -> Arc<PtyStoreInner> {
        Arc::clone(&self.inner)
    }

    pub fn handles(&self) -> &Mutex<HashMap<String, PtyHandle>> {
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
pub struct PtyExitPayload {
    pub terminal_id: String,
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
    terminal_id: &str,
) {
    let was_killed = {
        let mut handles = store.handles.lock().unwrap();
        if let Some(handle) = handles.remove(terminal_id) {
            handle.is_killed.load(Ordering::SeqCst)
        } else {
            false
        }
    };
    if !was_killed {
        let _ = app_handle.emit("pty-exit", &PtyExitPayload {
            terminal_id: terminal_id.to_string(),
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
    terminal_id: String,
    pty_id: String,
    mut reader: Box<dyn Read + Send>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = [0u8; PTY_READ_BUFFER_SIZE];
        let mut acc: Vec<u8> = Vec::with_capacity(65536);
        let mut last_flush = std::time::Instant::now();
        const COALESCE_MAX_SIZE: usize = 65536;
        const COALESCE_MAX_MS: u64 = 16;

        let flush = |acc: &mut Vec<u8>, last_flush: &mut std::time::Instant| {
            if !acc.is_empty() {
                emit_pty_output(&app_handle, &pty_id, acc);
                acc.clear();
                *last_flush = std::time::Instant::now();
            }
        };

        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    flush(&mut acc, &mut last_flush);
                    handle_pty_exit(&store, &app_handle, &terminal_id);
                    break;
                }
                Ok(n) => {
                    acc.extend_from_slice(&buf[..n]);
                    let elapsed = last_flush.elapsed().as_millis() as u64;
                    if acc.len() >= COALESCE_MAX_SIZE || elapsed >= COALESCE_MAX_MS {
                        flush(&mut acc, &mut last_flush);
                    }
                }
                Err(_) => {
                    flush(&mut acc, &mut last_flush);
                    break;
                }
            }
        }
    })
}

fn spawn_pty_internal(
    store: &Arc<PtyStoreInner>,
    app_handle: &tauri::AppHandle,
    terminal_id: &str,
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
        terminal_id.to_string(),
        pty_id.clone(),
        reader,
    );

    let handle = PtyHandle {
        pty_id: pty_id.clone(),
        child,
        writer,
        master,
        spawn_config: config.clone(),
        _reader_thread: reader_thread,
        is_killed: AtomicBool::new(false),
    };

    let mut handles = store.handles.lock().map_err(|e| e.to_string())?;
    handles.insert(terminal_id.to_string(), handle);

    Ok(pty_id)
}

fn get_existing_pty_id(store: &PtyStore, terminal_id: &str) -> Result<Option<String>, String> {
    let handles = store.handles().lock().map_err(|e| e.to_string())?;
    Ok(handles.get(terminal_id)
        .and_then(|h| if h.child.process_id().is_some() { Some(h.pty_id.clone()) } else { None }))
}

fn remove_dead_pty(store: &PtyStore, terminal_id: &str) -> Result<(), String> {
    let mut handles = store.handles().lock().map_err(|e| e.to_string())?;
    if let Some(mut old) = handles.remove(terminal_id) {
        let _ = old.child.kill();
    }
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
    terminal_id: String,
    pty_command: Option<String>,
    session_id: String,
    working_directory: String,
) -> Result<PtySpawnResult, String> {
    if let Some(pty_id) = get_existing_pty_id(store, &terminal_id)? {
        return Ok(PtySpawnResult { pty_id });
    }
    remove_dead_pty(store, &terminal_id)?;
    let shell = resolve_shell(pty_command.as_deref());
    let config = SpawnConfig { shell, session_id, working_directory };
    let store_arc = store.arc();
    let pty_id = spawn_pty_internal(&store_arc, &app_handle, &terminal_id, &config)?;
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
    terminal_id: &str,
) -> Result<(), String> {
    let mut handles = store.handles().lock().map_err(|e| e.to_string())?;
    if let Some(handle) = handles.get_mut(terminal_id) {
        handle.is_killed.store(true, Ordering::SeqCst);
        let _ = handle.child.kill();
    }
    handles.remove(terminal_id);
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
    fn test_idempotent_spawn_returns_existing() {
        let store = PtyStore::new();
        let handles = store.handles().lock().unwrap();
        assert!(handles.get("terminal-1").is_none());
    }

    #[test]
    fn test_remove_dead_pty_nonexistent() {
        let store = PtyStore::new();
        // Should succeed even if terminal_id doesn't exist
        remove_dead_pty(&store, "nonexistent").unwrap();
    }

    #[test]
    fn test_pty_kill_removes_handle() {
        let store = PtyStore::new();
        // Should succeed even if terminal_id doesn't exist (no-op)
        pty_kill(&store, "term-1").unwrap();
    }
}
