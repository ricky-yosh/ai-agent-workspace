# AI Agent Workspace

A macOS desktop app where humans and AI agents share a visual workspace. The app bundles an MCP server that AI tools (Claude Code, Cursor, etc.) use to read and manipulate the workspace — panels, terminal sessions, whiteboard, and more — without leaving their own interface.

**Version:** 0.1.1

## Requirements

- macOS
- Claude Code (or another MCP-compatible client)

## Installation

1. Download the `.dmg` from the [latest release](../../releases/latest) and open it.
2. Drag the app to `/Applications`.
3. Clear the macOS quarantine flag (the app is not yet notarized) by running this in Terminal:
   ```sh
   xattr -cr "/Applications/AI Agent Workspace.app"
   ```
4. Open the app — the zero state walks you through registering the MCP server with your AI tool.

## MCP Setup

Register the MCP server with Claude Code:

```sh
claude mcp add aiaws -- "/Applications/AI Agent Workspace.app/Contents/Resources/aiaw-mcp-server"
```

The app's zero state can do this for you, or you can run it manually. The binary lives inside the `.app` bundle — no separate installation needed.

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

See [`docs/commands.md`](docs/commands.md) for build, release, and MCP commands.

## License

Released under the [MIT License](LICENSE). You are free to use, modify, and distribute this app.
