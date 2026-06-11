use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use tempfile::TempDir;

fn binary_path() -> std::path::PathBuf {
    std::env::current_dir()
        .unwrap()
        .join("../../target/debug/ai-agent-workspace-mcp-server")
}

fn create_fixture(sessions_json: &str) -> TempDir {
    let dir = TempDir::new().unwrap();
    let sessions_path = dir.path().join("sessions.json");
    std::fs::write(&sessions_path, sessions_json).unwrap();
    dir
}

fn read_stderr(child: &mut std::process::Child) -> String {
    let stderr = child.stderr.take().unwrap();
    let reader = BufReader::new(stderr);
    reader.lines().map(|l| l.unwrap()).collect::<Vec<_>>().join("\n")
}

#[test]
fn test_handshake() {
    let mut child = Command::new(&binary_path())
        .env("AIAW_SESSION_ID", "test-session")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap_or_else(|e| panic!("Failed to spawn binary: {}", e));

    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}"#;
    writeln!(stdin, "{}", init).unwrap();
    stdin.flush().unwrap();

    let line = lines.next().unwrap().unwrap();
    eprintln!("R1: {}", line.trim());
    assert!(line.contains("tools"), "Expected tools capability");

    match child.try_wait().unwrap() {
        Some(status) => panic!("Server died after init with status: {:?}", status),
        None => eprintln!("Server still alive after init"),
    }

    let initialized = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
    writeln!(stdin, "{}", initialized).unwrap();
    stdin.flush().unwrap();
    thread::sleep(Duration::from_millis(500));

    match child.try_wait().unwrap() {
        Some(status) => panic!("Server died after notification with status: {:?}", status),
        None => eprintln!("Server still alive after notification"),
    }

    let tools_list = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#;
    writeln!(stdin, "{}", tools_list).unwrap();
    stdin.flush().unwrap();
    thread::sleep(Duration::from_millis(500));

    match lines.next() {
        Some(Ok(line2)) => {
            eprintln!("R2: {}", line2.trim());
            assert!(line2.contains("session_create"), "Expected tools list");
        }
        Some(Err(e)) => panic!("Error reading tools/list: {}", e),
        None => {
            let status = child.try_wait().unwrap();
            panic!("No tools/list response. Server status: {:?}", status);
        }
    }

    drop(stdin);
    let _ = child.wait();
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

    let mut child = Command::new(&binary_path())
        .env("AIAW_SESSIONS_PATH", fixture.path().join("sessions.json"))
        .current_dir(&tmp)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}"#;
    writeln!(stdin, "{}", init).unwrap();
    stdin.flush().unwrap();

    let line = lines.next().unwrap().unwrap();
    eprintln!("R1: {}", line.trim());
    assert!(line.contains("tools"), "Expected tools capability in single match");

    let initialized = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
    writeln!(stdin, "{}", initialized).unwrap();
    stdin.flush().unwrap();
    thread::sleep(Duration::from_millis(500));

    let tools_list = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#;
    writeln!(stdin, "{}", tools_list).unwrap();
    stdin.flush().unwrap();
    thread::sleep(Duration::from_millis(500));

    match lines.next() {
        Some(Ok(line2)) => {
            eprintln!("R2: {}", line2.trim());
            assert!(line2.contains("session_create"), "Expected tools list");
        }
        other => panic!("Expected tools/list response, got {:?}", other),
    }

    drop(stdin);
    let _ = child.wait();
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
    let mut child = Command::new(&binary_path())
        .env("AIAW_SESSIONS_PATH", fixture.path().join("sessions.json"))
        .current_dir(&tmp)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    let status = child.wait().unwrap();
    assert!(!status.success(), "Expected non-zero exit for no match");

    let stderr = read_stderr(&mut child);
    eprintln!("stderr: {}", stderr);
    assert!(stderr.contains("No session found"), "Expected 'No session found' in stderr, got: {}", stderr);
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

    let mut child = Command::new(&binary_path())
        .env("AIAW_SESSIONS_PATH", fixture.path().join("sessions.json"))
        .current_dir(&tmp)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    let status = child.wait().unwrap();
    assert!(!status.success(), "Expected non-zero exit for multiple matches");

    let stderr = read_stderr(&mut child);
    eprintln!("stderr: {}", stderr);
    assert!(stderr.contains("Multiple sessions"), "Expected 'Multiple sessions' in stderr, got: {}", stderr);
    assert!(stderr.contains("Alpha"), "Expected candidate name 'Alpha' in stderr");
    assert!(stderr.contains("Beta"), "Expected candidate name 'Beta' in stderr");
}
