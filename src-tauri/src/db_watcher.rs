//! Watches the SQLite database file directory for changes and emits a
//! `"db-changed"` Tauri event when the database is modified externally.
//!
//! This detects writes made by external processes (e.g. the standalone MCP
//! server binary) that bypass the Tauri IPC layer, ensuring the frontend
//! refreshes issue data in real-time.

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Spawns a background thread that watches the directory containing the
/// SQLite database file.
///
/// On modify events targeting the database file (or its WAL/SHM companion
/// files), the function emits a `"db-changed"` event via the Tauri app handle,
/// debounced to 500 ms to coalesce bursts from a single transaction.
pub fn spawn_db_watcher(app_handle: tauri::AppHandle, db_path: &Path) {
    let db_dir = match db_path.parent() {
        Some(dir) => dir.to_path_buf(),
        None => {
            eprintln!("[db_watcher] DB path has no parent, cannot watch");
            return;
        }
    };

    let db_stem = db_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("workspace.db")
        .to_string();

    let (tx, rx) = mpsc::channel::<Result<Event, notify::Error>>();

    let mut watcher = match RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            let _ = tx.send(res);
        },
        Config::default(),
    ) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("[db_watcher] Failed to create watcher: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&db_dir, RecursiveMode::NonRecursive) {
        eprintln!("[db_watcher] Failed to watch {db_dir:?}: {e}");
        return;
    }

    std::thread::spawn(move || {
        // Keep the watcher alive for the lifetime of this thread.
        let _watcher = watcher;

        let debounce = Duration::from_millis(500);
        let mut last_emit = Instant::now()
            .checked_sub(debounce)
            .unwrap_or(Instant::now());

        while let Ok(event) = rx.recv() {
            let event = match event {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("[db_watcher] Watch error: {e}");
                    continue;
                }
            };

            // Only react to modify events targeting the DB file or its
            // WAL / SHM companion files
            // (e.g. workspace.db, workspace.db-wal, workspace.db-shm).
            let is_db_modify = matches!(event.kind, EventKind::Modify(_))
                && event.paths.iter().any(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with(&db_stem))
                        .unwrap_or(false)
                });

            if !is_db_modify {
                continue;
            }

            let now = Instant::now();
            if now.duration_since(last_emit) >= debounce {
                last_emit = now;
                let _ = app_handle.emit("db-changed", ());
            }
        }

        eprintln!("[db_watcher] Watcher channel closed, shutting down");
    });
}
