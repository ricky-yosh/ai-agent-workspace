# AI Agent Workspace

A macOS desktop app where humans and AI agents share a visual workspace. The app bundles an MCP server that AI tools (Claude Code, Cursor, etc.) use to read and manipulate the workspace — panels, terminal sessions, whiteboard, and more — without leaving their own interface.

**Version:** 0.1.0

## Requirements

- macOS
- Claude Code (or another MCP-compatible client)

## Installation

1. Download the `.app` and drag it to `/Applications`.
2. Run the installer script to install the bundled `aiaw-mcp-server` binary into your `PATH`:

```sh
bash scripts/install.sh
```

## MCP Setup

Register the MCP server with Claude Code:

```sh
claude mcp add aiaws -- aiaw-mcp-server
```

This makes the `aiaws` MCP server available in every Claude Code session. The binary is the same one bundled inside the `.app`; a standalone version is also installed by `scripts/install.sh` for use outside the GUI.

## Sessions

A session ties a working directory to a workspace state (layout, whiteboard, terminal history). The MCP server resolves the current session in priority order:

1. `AIAW_SESSION_ID` environment variable — set automatically by the built-in terminal when you open a shell inside the app.
2. Working directory match — if `AIAW_SESSION_ID` is not set, the server looks up the session whose `workingDirectory` matches the process's `cwd`.

The automatic injection means that if you launch Claude Code from the app's built-in terminal, the MCP server already knows which session to target with no manual configuration.

## Getting Started

1. Open AI Agent Workspace.
2. Create a session and set its working directory to your project root.
3. Open the built-in terminal (the terminal panel inside the app).
4. Run `claude` — Claude Code inherits `AIAW_SESSION_ID` from the shell environment.
5. Claude Code now has access to the `aiaws` MCP tools and operates in the context of your session.

## Building from Source

```sh
bash scripts/build-release.sh
```

This produces a signed `.app` bundle and the standalone `aiaw-mcp-server` binary. The app identifier is `com.rickyyoshioka.ai-agent-workspace`.
