#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building MCP server (release)..."
cargo build --release -p aiaw-mcp-server

echo "==> Building Tauri app (release)..."
cargo tauri build

echo ""
echo "Done. DMG and .app are in src-tauri/target/release/bundle/"
