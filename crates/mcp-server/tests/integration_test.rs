use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

#[test]
fn test_handshake() {
    let binary = std::env::current_dir()
        .unwrap()
        .join("../../target/debug/ai-agent-workspace-mcp-server");

    let mut child = Command::new(&binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap_or_else(|e| panic!("Failed to spawn {}: {}", binary.display(), e));

    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    // Send initialize
    let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}"#;
    writeln!(stdin, "{}", init).unwrap();
    stdin.flush().unwrap();

    // Read init response
    let line = lines.next().unwrap().unwrap();
    eprintln!("R1: {}", line.trim());
    assert!(line.contains("tools"), "Expected tools capability");

    // Check if process still alive
    match child.try_wait().unwrap() {
        Some(status) => panic!("Server died after init with status: {:?}", status),
        None => eprintln!("Server still alive after init"),
    }

    // Send initialized notification
    let initialized = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
    writeln!(stdin, "{}", initialized).unwrap();
    stdin.flush().unwrap();
    thread::sleep(Duration::from_millis(500));

    // Check again
    match child.try_wait().unwrap() {
        Some(status) => panic!("Server died after notification with status: {:?}", status),
        None => eprintln!("Server still alive after notification"),
    }

    // Send tools/list
    let tools_list = r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#;
    writeln!(stdin, "{}", tools_list).unwrap();
    stdin.flush().unwrap();
    thread::sleep(Duration::from_millis(500));

    // Read tools/list response
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
