# ADR 0001: Use rusqlite (Sync) for Persistence

## Status

Accepted

## Context

The application needs to migrate from JSON-file persistence to SQLite. The codebase has two consumers of persistence:

1. The Tauri app, which runs synchronous commands via `execute(Command, &AppState)`.
2. The standalone MCP server, which runs on a `tokio` async runtime.

The command executor is synchronous today. Moving to async persistence (sqlx) would require either making the entire command layer async or wrapping every call in `block_on`. The MCP server is async but only makes occasional persistence calls.

## Decision

Use `rusqlite` with the `bundled` feature. Keep the command executor synchronous. The MCP server will wrap persistence calls in `tokio::task::spawn_blocking` to bridge sync/async.

## Consequences

- Simpler dependency tree and no async runtime requirement in `crates/core` or `crates/commands`.
- The MCP server pays a small overhead for `spawn_blocking` on each persistence call, which is acceptable given low write volume.
- If the application ever needs high-concurrency writes, a migration to `sqlx` or a connection pool would be required.
- Tests can use in-memory SQLite (`":memory:"`) without async test harnesses.
