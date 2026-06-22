# Common Commands

## Development

```sh
npm run tauri dev
```
Start the app in dev mode with hot reload. Note: the app menu bar will show `ai-agent-workspace` (the Cargo binary name) in dev — this is normal. Release builds show "AI Agent Workspace".

## Building

```sh
bash scripts/build-release.sh
```
Builds the standalone `aiaw-mcp-server` binary and the Tauri app. Output:
- DMG: `target/release/bundle/dmg/`
- .app: `target/release/bundle/macos/`

```sh
cargo clean
```
Deletes all build artifacts under `target/`. Run this when switching between debug and release builds, or when you hit unexplained build errors. Rebuild will be slow after this.

## Icons

```sh
cargo tauri icon src-tauri/icons/icon.png
```
Generates all required icon sizes and formats (`.icns`, `.ico`, PNGs) from a single 1024×1024 source PNG. Output goes into `src-tauri/icons/`.

## Releasing

**1. Build artifacts:**
```sh
bash scripts/build-release.sh
```

**2. Create the GitHub release and upload the DMG:**
```sh
gh release create v0.1.0 \
  --title "v0.1.0" \
  --notes "Initial release." \
  "target/release/bundle/dmg/AI Agent Workspace_0.1.0_x64.dmg"
```
This creates the git tag, pushes it, creates the GitHub release, and attaches the DMG in one command. Bump the version number in `package.json`, `src-tauri/tauri.conf.json`, and all `crates/*/Cargo.toml` before each release.

## MCP

```sh
# Register the MCP server with Claude Code (absolute path — no install needed)
claude mcp add aiaws -- "/Applications/AI Agent Workspace.app/Contents/Resources/aiaw-mcp-server"

# List registered MCP servers
claude mcp list

# Remove the MCP server
claude mcp remove aiaws
```
