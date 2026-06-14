use std::fs::File;
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

fn create_fixture(sessions_json: &str) -> TempDir {
    let dir = TempDir::new().unwrap();
    let sessions_path = dir.path().join("sessions.json");
    std::fs::write(&sessions_path, sessions_json).unwrap();
    dir
}

fn read_stderr_file(path: &std::path::Path) -> String {
    match std::fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => String::new(),
    }
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
    // notifications/initialized has no response — cannot block on a read
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
    let fixture = create_fixture(&format!(
        r#"{{
            "sessions": [{{
                "id": "sess-001",
                "name": "Test Session",
                "working_directory": "{}",
                "state": "Paused",
                "active_workspace_id": null,
                "workspaces": [],
                "created_at": "2025-01-01T00:00:00+00:00",
                "updated_at": "2025-01-01T00:00:00+00:00"
            }}]
        }}"#,
        tmp_str
    ));

    let sessions_path = fixture.path().join("sessions.json");
    let mut server = spawn_server(
        &[("AIAW_SESSIONS_PATH", sessions_path.to_str().unwrap())],
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
    let fixture = create_fixture(r#"{
        "sessions": [{
            "id": "sess-002",
            "name": "Unreachable Session",
            "working_directory": "/nonexistent/path/abc123",
            "state": "Missing",
            "active_workspace_id": null,
            "workspaces": [],
            "created_at": "2025-01-01T00:00:00+00:00",
            "updated_at": "2025-01-01T00:00:00+00:00"
        }]
    }"#);

    let tmp = std::env::temp_dir();
    let stderr_file = fixture.path().join("stderr.txt");
    let stderr_fd = File::create(&stderr_file).unwrap();

    let mut child = Command::new(&binary_path())
        .env("AIAW_SESSIONS_PATH", fixture.path().join("sessions.json"))
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

    let stderr = read_stderr_file(&stderr_file);
    eprintln!("stderr: {}", stderr);
    assert!(stderr.contains("No session found"), "Expected 'No session found' in stderr, got: {}", stderr);

    drop(child.stdin.take());
    let _ = child.wait();
}

#[test]
fn test_startup_multiple_matches() {
    let tmp = std::env::temp_dir();
    let tmp_str = tmp.to_str().unwrap();
    let fixture = create_fixture(&format!(
        r#"{{
            "sessions": [
                {{
                    "id": "sess-003",
                    "name": "Alpha",
                    "working_directory": "{}",
                    "state": "Paused",
                    "active_workspace_id": null,
                    "workspaces": [],
                    "created_at": "2025-01-01T00:00:00+00:00",
                    "updated_at": "2025-01-01T00:00:00+00:00"
                }},
                {{
                    "id": "sess-004",
                    "name": "Beta",
                    "working_directory": "{}",
                    "state": "Paused",
                    "active_workspace_id": null,
                    "workspaces": [],
                    "created_at": "2025-01-01T00:00:00+00:00",
                    "updated_at": "2025-01-01T00:00:00+00:00"
                }}
            ]
        }}"#,
        tmp_str, tmp_str
    ));

    let stderr_file = fixture.path().join("stderr.txt");
    let stderr_fd = File::create(&stderr_file).unwrap();

    let mut child = Command::new(&binary_path())
        .env("AIAW_SESSIONS_PATH", fixture.path().join("sessions.json"))
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

    let stderr = read_stderr_file(&stderr_file);
    eprintln!("stderr: {}", stderr);
    assert!(stderr.contains("Multiple sessions"), "Expected 'Multiple sessions' in stderr, got: {}", stderr);
    assert!(stderr.contains("Alpha"), "Expected candidate name 'Alpha' in stderr");
    assert!(stderr.contains("Beta"), "Expected candidate name 'Beta' in stderr");

    drop(child.stdin.take());
    let _ = child.wait();
}
