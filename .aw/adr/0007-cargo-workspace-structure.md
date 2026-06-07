# ADR 0007: Cargo Workspace with Core, Commands, and CLI Crates

## Status

Accepted

## Context

The project needs a CLI to test the backend engine (SessionRegistry, LayoutStore) without launching the Tauri GUI. The CLI should be the foundation for the future Command Layer described in IDEA.md — where CLI, MCP, and UI all dispatch through a shared command interface. We need to decide where the CLI binary lives and how the Command abstraction is structured.

Two options were considered:

A) A `[[bin]]` target in the existing `src-tauri/` crate — quick, no restructuring, but mixes Tauri dependencies with CLI code and doesn't match the IDEA.md architecture.

B) A Cargo workspace with separate crates for domain logic, commands, and CLI — cleaner separation, matches the target architecture, but requires restructuring upfront.

## Decision

Restructure into a Cargo workspace with three crates:

- `crates/core/` — lib crate containing domain logic: `SessionRegistry`, `LayoutStore`, and their types. No dependency on Tauri, CLI frameworks, or command abstractions.
- `crates/commands/` — lib crate containing the `Command` enum, `CommandResult` enum, and an `execute()` function that dispatches commands to core modules. Depends on `core`.
- `crates/cli/` — binary crate containing the CLI binary (`aiaws`). Uses `clap` for argument parsing. Depends on `commands`.

The existing `src-tauri/` Tauri app also depends on `commands` for its IPC layer.

This matches the target architecture from IDEA.md where all interfaces (CLI, MCP, UI) dispatch through the Command Layer.

## Consequences

- `core` stays pure domain logic — it has no knowledge of how it's invoked.
- Adding new interfaces (MCP servers, scripts) means adding a new binary crate that depends on `commands`.
- The workspace has 4 member crates instead of 1, adding some structural overhead.
- Extracting `commands` into its own crate now avoids a future refactor when the Command Layer grows (undo/redo, middleware, event generation).
