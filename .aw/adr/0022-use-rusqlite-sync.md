# ADR 0022: Use rusqlite (Sync) for Persistence

## Status

Accepted

## Context

Persistence migrates from JSON files to SQLite. Two consumers exist: the Tauri app, which runs synchronous commands via `execute(Command, &AppState)`, and the standalone MCP server, which runs on a `tokio` async runtime but makes only occasional persistence calls. Moving to async persistence (sqlx) would force the entire command layer async or wrap every call in `block_on` — a cost paid for a write volume that doesn't need it.

## Decision

Use `rusqlite` with the `bundled` feature and keep the command executor synchronous. The MCP server bridges sync/async by wrapping persistence calls in `tokio::task::spawn_blocking`.

## Consequences

- No async runtime required in `crates/core` or `crates/commands`; simpler dependency tree.
- The MCP server pays a small `spawn_blocking` overhead per call — acceptable at low write volume.
- Tests use in-memory SQLite (`":memory:"`) without async harnesses.
- High-concurrency writes would later require `sqlx` or a connection pool.
