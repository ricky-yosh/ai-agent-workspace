# Plan: Task 4 — Build CLI Binary

## Current State
- `crates/cli/Cargo.toml` — binary crate `aiaws`, depends only on `ai-agent-workspace-core`
- `crates/cli/src/main.rs` — stub `fn main()` with placeholder println
- `crates/commands/` — complete command layer with `Command` enum, `AppState`, `execute()`, `CommandResult`, `CommandError`
- Core types (`Session`, `SessionSummary`) already derive `Serialize`

## Scope
Modify exactly 2 files in `crates/cli/`:
1. `crates/cli/Cargo.toml` — add dependencies
2. `crates/cli/src/main.rs` — implement CLI binary

No changes to `crates/core/`, `crates/commands/`, or `src-tauri/`.

## Step 1: Update `crates/cli/Cargo.toml`

Add `ai-agent-workspace-commands`, `clap`, and `serde_json` to `[dependencies]`. Keep the existing `ai-agent-workspace-core` dep.

```toml
[dependencies]
ai-agent-workspace-core = { path = "../core" }
ai-agent-workspace-commands = { path = "../commands" }
clap = { version = "4", features = ["derive"] }
serde_json = "1"
```

## Step 2: Implement `crates/cli/src/main.rs`

Structure with clap derive macros:

1. **`Cli` struct** — top-level parser with `#[command(name = "aiaws", about = "...")]`
2. **`Commands` enum** — single `Session` subcommand containing `SessionAction`
3. **`SessionAction` enum** — 6 variants:
   - `Create { name, dir }` — both `--name` and `--dir` as required `String` args
   - `List` — no args
   - `Rename { id, new_name }` — both `--id` and `--new-name` as required `String` args
   - `Delete { id }` — `--id` as required `String` arg
   - `Open { id }` — `--id` as required `String` arg
   - `Close { id }` — `--id` as required `String` arg
4. **`main()` function**:
   - Parse CLI args
   - Initialize `AppState::new()` — on error, print JSON error to stderr and `process::exit(1)`
   - Match on `SessionAction` variant, call `execute(Command::SessionCreate{..}, &state)` etc.
   - On `Ok(CommandResult)`: serialize with `serde_json::to_string_pretty` and print to stdout
   - On `Err(CommandError)`: serialize with `serde_json::to_string` and print to stderr, `process::exit(1)`
   - `CommandResult::Unit(())` → print `"null"`
   - All other `CommandResult` variants → `unreachable!()` (session commands only produce `Session`, `Sessions`, or `Unit`)

## Step 3: Verify

1. `cargo check -p ai-agent-workspace-cli` — compiles cleanly
2. `cargo build -p ai-agent-workspace-cli` — produces `aiaws` binary
3. `cargo test --workspace` — all existing tests pass
4. Manual tests:
   - `./target/debug/aiaws session --help` — shows Create, List, Rename, Delete, Open, Close
   - `./target/debug/aiaws session list` — returns JSON array
   - `./target/debug/aiaws session create --name "test-session" --dir "/tmp"` — returns JSON Session
   - `./target/debug/aiaws session delete --id "nonexistent"` — stderr JSON error, exit 1

## Risks
- The `commands` crate depends on `tauri`, `tauri-plugin-opener`, and `tauri-plugin-dialog`. These will be pulled into the CLI binary dependency tree but are not used by session commands. This is harmless — they just add to compile time and binary size. The user said not to modify `crates/commands/`, so this is accepted.
- `AppState::new()` returns `Result<Self, RegistryError>` (not `CommandError`). The `From<RegistryError> for CommandError` impl exists, but `main()` uses `unwrap_or_else` so we format the error directly rather than relying on `?` conversion.

## Estimated Effort
~15 minutes. Two file edits, one compile check, one manual smoke test.
