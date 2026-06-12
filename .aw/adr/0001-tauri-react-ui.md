# ADR 0001: Use Tauri + React for Desktop UI

## Status

Accepted

## Context

The application needs a cross-platform desktop UI with a node-graph canvas for the whiteboard, split-screen panel layouts (Blender-style), a terminal panel, a diff viewer, and a markdown renderer. Two stacks were considered:

- **GPUI** (Rust-native): Maximum native performance, no web dependency, tightest Rust integration. But pre-1.0, tiny ecosystem, no mature node-graph library, and high iteration risk.
- **Tauri + React (React Flow)**: Tauri provides a Rust backend with a webview frontend. React Flow is a battle-tested node-graph library. Larger ecosystem, lower risk, faster iteration.

## Decision

Use **Tauri + React with React Flow** for the v1 desktop application.

The Rust backend remains the core: the Command Layer, event store, session management, and both MCP servers all live in Rust. Tauri exposes these to the React frontend via its IPC bridge. React Flow handles the whiteboard canvas rendering. The terminal panel uses xterm.js. The diff viewer and markdown renderer use standard React libraries.

## Consequences

- Positive: React Flow gives us drag-and-drop nodes, edge drawing, minimap, and frame grouping out of the box.
- Positive: Faster iteration — hot-reload frontend changes without recompiling Rust.
- Positive: Vast React ecosystem for panels (terminal, diff, markdown).
- Negative: Bundle size increases by ~150MB due to Tauri's Chromium webview.
- Negative: UI responsiveness is gated by IPC bridge latency, though this is negligible for the whiteboard interaction patterns we need.
- Negative: Tauri is not pure Rust — some platform-specific behavior will leak through the webview layer.
