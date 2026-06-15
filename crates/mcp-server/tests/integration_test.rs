use std::io::{BufRead, BufReader, Lines, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::thread;
use std::time::Duration;
use tempfile::TempDir;

fn binary_path() -> std::path::PathBuf {
    std::env::current_dir()
        .unwrap()
        .join("../../target/debug/aiaw-mcp-server")
}

fn create_db_fixture(session_rows: &[(&str, &str, &str)]) -> TempDir {
    let dir = TempDir::new().unwrap();
    let db_path = dir.path().join("workspace.db");
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         PRAGMA busy_timeout=5000;",
    ).unwrap();
    ai_agent_workspace_core::database::migrations::migrate(&conn).unwrap();

    for &(id, name, working_dir) in session_rows {
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO sessions (id, name, working_directory, state, active_workspace_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'Paused', NULL, ?4, ?5)",
            rusqlite::params![id, name, working_dir, now, now],
        ).unwrap();
    }

    dir
}

struct ServerProcess {
    child: Child,
    stdin: ChildStdin,
    lines: Lines<BufReader<ChildStdout>>,
}

fn spawn_server(env: &[(&str, &str)], cwd: Option<&Path>) -> ServerProcess {
    let mut cmd = Command::new(binary_path());
    for &(k, v) in env {
        cmd.env(k, v);
    }
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().unwrap();
    let stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let lines = reader.lines();
    ServerProcess { child, stdin, lines }
}

fn do_handshake(server: &mut ServerProcess) {
    let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}"#;
    writeln!(server.stdin, "{}", init).unwrap();
    server.stdin.flush().unwrap();

    let line = server.lines.next().unwrap().unwrap();
    eprintln!("R1: {}", line.trim());
    assert!(line.contains("tools"), "Expected tools capability");

    match server.child.try_wait().unwrap() {
        Some(status) => panic!("Server died after init with status: {:?}", status),
        None => eprintln!("Server still alive after init"),
    }

    let initialized = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
    writeln!(server.stdin, "{}", initialized).unwrap();
    server.stdin.flush().unwrap();
    thread::sleep(Duration::from_millis(500));

    match server.child.try_wait().unwrap() {
        Some(status) => panic!("Server died after notification with status: {:?}", status),
        None => eprintln!("Server still alive after notification"),
    }
}

fn send_tools_list(server: &mut ServerProcess) -> String {
    let tools_list = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#;
    writeln!(server.stdin, "{}", tools_list).unwrap();
    server.stdin.flush().unwrap();

    server.lines.next().unwrap().unwrap()
}

#[test]
fn test_handshake() {
    let mut server = spawn_server(&[("AIAW_SESSION_ID", "test-session")], None);

    do_handshake(&mut server);

    let line2 = send_tools_list(&mut server);
    eprintln!("R2: {}", line2.trim());
    assert!(line2.contains("session_create"), "Expected tools list");

    drop(server.stdin);
    let _ = server.child.wait();
}

#[test]
fn test_startup_single_match() {
    let tmp = std::env::temp_dir();
    let tmp_str = tmp.to_str().unwrap();
    let fixture = create_db_fixture(&[
        ("sess-001", "Test Session", tmp_str),
    ]);

    let db_path = fixture.path().join("workspace.db");
    let mut server = spawn_server(
        &[("AIAW_DB_PATH", db_path.to_str().unwrap())],
        Some(&tmp),
    );

    do_handshake(&mut server);

    let line2 = send_tools_list(&mut server);
    eprintln!("R2: {}", line2.trim());
    assert!(line2.contains("session_create"), "Expected tools list");

    drop(server.stdin);
    let _ = server.child.wait();
}

#[test]
fn test_startup_no_match() {
    let fixture = create_db_fixture(&[
        ("sess-002", "Unreachable Session", "/nonexistent/path/abc123"),
    ]);

    let tmp = std::env::temp_dir();
    let stderr_file = fixture.path().join("stderr.txt");
    let stderr_fd = std::fs::File::create(&stderr_file).unwrap();

    let db_path = fixture.path().join("workspace.db");
    let mut child = Command::new(&binary_path())
        .env("AIAW_DB_PATH", db_path.to_str().unwrap())
        .current_dir(&tmp)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(stderr_fd)
        .spawn()
        .unwrap();

    thread::sleep(Duration::from_millis(500));

    match child.try_wait().unwrap() {
        Some(status) => panic!("Server exited with status {:?} — should stay alive without session", status),
        None => eprintln!("Server alive without resolved session"),
    }

    let stderr = std::fs::read_to_string(&stderr_file).unwrap_or_default();
    eprintln!("stderr: {}", stderr);
    assert!(stderr.contains("No session found"), "Expected 'No session found' in stderr, got: {}", stderr);

    drop(child.stdin.take());
    let _ = child.wait();
}

#[test]
fn test_startup_multiple_matches() {
    let tmp = std::env::temp_dir();
    let tmp_str = tmp.to_str().unwrap();
    let fixture = create_db_fixture(&[
        ("sess-003", "Alpha", tmp_str),
        ("sess-004", "Beta", tmp_str),
    ]);

    let stderr_file = fixture.path().join("stderr.txt");
    let stderr_fd = std::fs::File::create(&stderr_file).unwrap();

    let db_path = fixture.path().join("workspace.db");
    let mut child = Command::new(&binary_path())
        .env("AIAW_DB_PATH", db_path.to_str().unwrap())
        .current_dir(&tmp)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(stderr_fd)
        .spawn()
        .unwrap();

    thread::sleep(Duration::from_millis(500));

    match child.try_wait().unwrap() {
        Some(status) => panic!("Server exited with status {:?} — should stay alive with ambiguous sessions", status),
        None => eprintln!("Server alive with ambiguous session resolution"),
    }

    let stderr = std::fs::read_to_string(&stderr_file).unwrap_or_default();
    eprintln!("stderr: {}", stderr);
    assert!(stderr.contains("Multiple sessions"), "Expected 'Multiple sessions' in stderr, got: {}", stderr);
    assert!(stderr.contains("Alpha"), "Expected candidate name 'Alpha' in stderr");
    assert!(stderr.contains("Beta"), "Expected candidate name 'Beta' in stderr");

    drop(child.stdin.take());
    let _ = child.wait();
}
