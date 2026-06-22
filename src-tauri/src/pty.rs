use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use portable_pty::{CommandBuilder, PtySize, native_pty_system, MasterPty};
use serde::Serialize;
use tauri::Emitter;
use tauri::ipc::{Channel, InvokeResponseBody};
use uuid::Uuid;

const DEFAULT_PTY_ROWS: u16 = 24;
const DEFAULT_PTY_COLS: u16 = 80;
const PTY_READ_BUFFER_SIZE: usize = 16384;

// ACK-based flow control, mirroring VSCode's FlowControlConstants. The reader
// thread pauses once it has sent this many UNACKNOWLEDGED bytes to the frontend,
// and resumes once acks bring the outstanding count back down to LOW_WATERMARK.
// This bounds xterm's parse buffer during heavy output (e.g. `cat bigfile`) so
// the main thread can't be pinned, which is what made the UI laggy.
const HIGH_WATERMARK: usize = 100_000;
const LOW_WATERMARK: usize = 5_000;

/// Backpressure bookkeeping shared between a PTY's reader thread (which parks on
/// the condvar when over the high watermark) and `pty_ack`/`pty_kill` (which
/// credit acknowledged bytes / signal shutdown and wake the parked reader).
struct FlowState {
    unacked: usize,
    paused: bool,
    killed: bool,
}

impl FlowState {
    /// Reader, before each read: begin pausing once we've sent too much
    /// unacknowledged output.
    fn note_before_read(&mut self) {
        if self.unacked >= HIGH_WATERMARK {
            self.paused = true;
        }
    }

    /// Reader, after waking on the condvar: resume only once acks have drained
    /// outstanding bytes to the low watermark (hysteresis — prevents thrashing
    /// at the high boundary).
    fn note_after_wake(&mut self) {
        if self.unacked <= LOW_WATERMARK {
            self.paused = false;
        }
    }

    /// Credit acknowledged bytes and clear the pause once drained to the low
    /// watermark.
    fn credit(&mut self, bytes: usize) {
        self.unacked = self.unacked.saturating_sub(bytes);
        if self.unacked <= LOW_WATERMARK {
            self.paused = false;
        }
    }
}

type Flow = Arc<(Mutex<FlowState>, Condvar)>;

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
    flow: Flow,
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

#[derive(Debug, Clone, Serialize)]
pub struct PtySpawnResult {
    pub pty_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PtyExitPayload {
    pub terminal_id: String,
}

/// Lock the handles mutex, recovering the guard even if it was poisoned by a
/// previous panic. This keeps a single panic from permanently bricking the
/// store: every subsequent `.lock()` would otherwise return `Err` forever.
fn lock_handles(
    handles: &Mutex<HashMap<String, PtyHandle>>,
) -> std::sync::MutexGuard<'_, HashMap<String, PtyHandle>> {
    match handles.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn shell_login_args(shell: &str) -> &'static [&'static str] {
    let name = std::path::Path::new(shell)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match name.as_str() {
        "zsh" | "bash" | "fish" => &["-l", "-i"],
        _ => &[],
    }
}

fn create_pty_pair(config: &SpawnConfig, size: PtySize) -> Result<(Box<dyn MasterPty + Send>, Box<dyn portable_pty::Child + Send>, Box<dyn Read + Send>, Box<dyn Write + Send>), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;
    let mut cmd = CommandBuilder::new(&config.shell);
    for arg in shell_login_args(&config.shell) {
        cmd.arg(arg);
    }
    cmd.env("AIAW_SESSION_ID", &config.session_id);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
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
        let mut handles = lock_handles(&store.handles);
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

/// Set `killed = true` on a flow state and wake the (possibly parked) reader so
/// it falls through to its exit path instead of leaking the thread.
fn signal_flow_killed(flow: &Flow) {
    let (lock, cvar) = &**flow;
    let mut state = match lock.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    state.killed = true;
    drop(state);
    cvar.notify_all();
}

fn run_pty_reader(
    store: Arc<PtyStoreInner>,
    app_handle: tauri::AppHandle,
    terminal_id: String,
    _pty_id: String,
    mut reader: Box<dyn Read + Send>,
    on_event: Channel<InvokeResponseBody>,
    flow: Flow,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = [0u8; PTY_READ_BUFFER_SIZE];

        loop {
            // Backpressure: park while we've sent too much unacknowledged data.
            // We never hold the `handles` lock here — only this PTY's own flow
            // mutex — so acks/kills (which take handles-then-flow) can't deadlock.
            {
                let (lock, cvar) = &*flow;
                let mut state = match lock.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                state.note_before_read();
                while state.paused && !state.killed {
                    state = match cvar.wait(state) {
                        Ok(g) => g,
                        Err(p) => p.into_inner(),
                    };
                    state.note_after_wake();
                }
            }

            match reader.read(&mut buf) {
                Ok(0) => {
                    signal_flow_killed(&flow);
                    handle_pty_exit(&store, &app_handle, &terminal_id);
                    break;
                }
                Ok(n) => {
                    // Send promptly — no fixed-timer coalescing. xterm batches
                    // rendering internally on rAF; quantizing output into 16ms
                    // buckets here only added stutter to animations.
                    let _ = on_event.send(InvokeResponseBody::Raw(buf[..n].to_vec()));
                    let (lock, _cvar) = &*flow;
                    let mut state = match lock.lock() {
                        Ok(g) => g,
                        Err(p) => p.into_inner(),
                    };
                    state.unacked += n;
                }
                Err(_) => {
                    signal_flow_killed(&flow);
                    handle_pty_exit(&store, &app_handle, &terminal_id);
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
    on_event: Channel<InvokeResponseBody>,
) -> Result<String, String> {
    let pty_id = Uuid::new_v4().to_string();
    let size = PtySize {
        rows: DEFAULT_PTY_ROWS,
        cols: DEFAULT_PTY_COLS,
        pixel_width: 0,
        pixel_height: 0,
    };
    let (master, child, reader, writer) = create_pty_pair(config, size)?;

    let flow: Flow = Arc::new((
        Mutex::new(FlowState {
            unacked: 0,
            paused: false,
            killed: false,
        }),
        Condvar::new(),
    ));

    let reader_thread = run_pty_reader(
        Arc::clone(store),
        app_handle.clone(),
        terminal_id.to_string(),
        pty_id.clone(),
        reader,
        on_event,
        Arc::clone(&flow),
    );

    let handle = PtyHandle {
        pty_id: pty_id.clone(),
        child,
        writer,
        master,
        spawn_config: config.clone(),
        _reader_thread: reader_thread,
        is_killed: AtomicBool::new(false),
        flow,
    };

    let mut handles = lock_handles(&store.handles);
    handles.insert(terminal_id.to_string(), handle);

    Ok(pty_id)
}

fn get_existing_pty_id(store: &PtyStore, terminal_id: &str) -> Result<Option<String>, String> {
    let handles = lock_handles(store.handles());
    Ok(handles.get(terminal_id)
        .and_then(|h| if h.child.process_id().is_some() { Some(h.pty_id.clone()) } else { None }))
}

fn remove_dead_pty(store: &PtyStore, terminal_id: &str) -> Result<(), String> {
    let mut handles = lock_handles(store.handles());
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
    on_event: Channel<InvokeResponseBody>,
) -> Result<PtySpawnResult, String> {
    if let Some(pty_id) = get_existing_pty_id(store, &terminal_id)? {
        return Ok(PtySpawnResult { pty_id });
    }
    remove_dead_pty(store, &terminal_id)?;
    let shell = resolve_shell(pty_command.as_deref());
    let config = SpawnConfig { shell, session_id, working_directory };
    let store_arc = store.arc();
    let pty_id = spawn_pty_internal(&store_arc, &app_handle, &terminal_id, &config, on_event)?;
    Ok(PtySpawnResult { pty_id })
}

pub fn pty_write(
    store: &PtyStore,
    pty_id: &str,
    data: &[u8],
) -> Result<(), String> {
    let mut handles = lock_handles(store.handles());
    let handle = handles.values_mut().find(|h| h.pty_id == pty_id)
        .ok_or_else(|| format!("PTY not found: {}", pty_id))?;

    handle.writer.write_all(data).map_err(|e| e.to_string())?;
    handle.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Credit `bytes` of acknowledged output back to a PTY's flow controller. The
/// frontend calls this from xterm's parse-completion callback as it drains the
/// stream. Clears the paused flag once outstanding bytes fall to the low
/// watermark and wakes the reader. A missing pty_id (already exited) is not an
/// error — the ack is simply dropped.
pub fn pty_ack(
    store: &PtyStore,
    pty_id: &str,
    bytes: usize,
) -> Result<(), String> {
    // Clone the flow Arc out under the handles lock, then DROP that lock before
    // touching the flow mutex — preserves the handles-then-flow lock ordering.
    let flow = {
        let handles = lock_handles(store.handles());
        match handles.values().find(|h| h.pty_id == pty_id) {
            Some(h) => Arc::clone(&h.flow),
            None => return Ok(()),
        }
    };

    let (lock, cvar) = &*flow;
    let mut state = match lock.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    state.credit(bytes);
    drop(state);
    cvar.notify_all();
    Ok(())
}

pub fn pty_resize(
    store: &PtyStore,
    pty_id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut handles = lock_handles(store.handles());
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
    let mut handles = lock_handles(store.handles());
    if let Some(handle) = handles.get_mut(terminal_id) {
        handle.is_killed.store(true, Ordering::SeqCst);
        // Wake the reader if it's parked on backpressure so it exits instead of
        // leaking the thread; it then falls through to its read() exit path.
        signal_flow_killed(&handle.flow);
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

    fn fresh_flow() -> FlowState {
        FlowState { unacked: 0, paused: false, killed: false }
    }

    #[test]
    fn test_flow_pauses_at_high_watermark() {
        let mut s = fresh_flow();
        s.unacked = HIGH_WATERMARK - 1;
        s.note_before_read();
        assert!(!s.paused, "below high watermark must not pause");

        s.unacked = HIGH_WATERMARK;
        s.note_before_read();
        assert!(s.paused, "at/above high watermark must pause");
    }

    #[test]
    fn test_flow_resumes_only_at_low_watermark() {
        let mut s = fresh_flow();
        s.unacked = HIGH_WATERMARK;
        s.note_before_read();
        assert!(s.paused);

        // A wake that only partially drains (still above LOW) stays paused —
        // hysteresis prevents thrashing at the high boundary.
        s.unacked = LOW_WATERMARK + 1;
        s.note_after_wake();
        assert!(s.paused, "above low watermark must stay paused");

        // Once drained to the low watermark, resume.
        s.unacked = LOW_WATERMARK;
        s.note_after_wake();
        assert!(!s.paused, "at/below low watermark must resume");
    }

    #[test]
    fn test_flow_credit_drains_and_clears_pause() {
        let mut s = fresh_flow();
        s.unacked = HIGH_WATERMARK;
        s.paused = true;

        // Crediting part of it (still above LOW) keeps it paused.
        s.credit(HIGH_WATERMARK - LOW_WATERMARK - 1);
        assert_eq!(s.unacked, LOW_WATERMARK + 1);
        assert!(s.paused);

        // Crediting past LOW clears the pause.
        s.credit(2);
        assert_eq!(s.unacked, LOW_WATERMARK - 1);
        assert!(!s.paused);
    }

    #[test]
    fn test_flow_credit_saturates_at_zero() {
        let mut s = fresh_flow();
        s.unacked = 100;
        s.credit(1000);
        assert_eq!(s.unacked, 0, "over-ack must not underflow");
        assert!(!s.paused);
    }

    #[test]
    fn test_lock_handles_recovers_from_poison() {
        let store = PtyStore::new();
        // Poison the mutex by panicking while holding the guard.
        let poisoned = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = store.handles().lock().unwrap();
            panic!("intentional panic to poison the mutex");
        }));
        assert!(poisoned.is_err());
        assert!(store.handles().lock().is_err(), "mutex should be poisoned");

        // The poison-tolerant helper should still return a usable guard.
        let handles = lock_handles(store.handles());
        assert!(handles.is_empty());

        // Public operations relying on the helper keep working post-poison.
        drop(handles);
        pty_kill(&store, "term-1").unwrap();
    }
}
