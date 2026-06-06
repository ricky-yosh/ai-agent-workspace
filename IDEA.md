I want to create an AI tool to essentially create a node like system to help visualize the feature that the AI and I are creating. I place cards and connections and the AI agent also does. That way we can collaborate together. I prototyped the system in html and I have a solid reference, but I want to streamline the way that the model communicates with the "whiteboard". Currently I have a json that the ai agent can write to. 

I also want this tool to be able to display diffs live, have a cache like .ai-whiteboard-cache where it displays those files nicely in a markdown viewer. A codebase map there will need to be a command to create a codebase tree of some kind, the visualization can use the same node system that will be used for the whiteboard. A log for debugging.

I also want this app to have a MCP packaged with it so that the tool can interact with the app itself. I also want to create a MCP so that the AI can read through the codebase efficiently, like Sourcegraph.

Anyway I will need to create a node like system with sessions and be able to split screen like in Blender. I think Rust and Tauri and React.

A shortcut that I will take, is having a terminal built in that way users can invoke whatever AI Agent harness they want.

Help me organize my thoughts.

# AI Collaborative Workspace

## Vision

Create an AI-native collaborative workspace where both humans and AI agents can manipulate the same visual environment.

Unlike traditional AI tools that communicate exclusively through text, this application allows AI agents to directly create, modify, organize, and navigate workspace state through a shared command protocol.

The workspace combines:

* Visual whiteboarding
* Architecture planning
* Codebase visualization
* Artifact management
* Terminal workflows
* AI agent collaboration

The primary goal is to make project planning, architecture design, and code exploration collaborative between humans and AI.

---

# Core Principles

## Shared Workspace State

The AI and user operate on the same workspace.

Both parties can:

* Create cards
* Connect cards
* Create frames
* Generate artifacts
* Modify layouts
* Open tools and panels

The workspace becomes part of the conversation.

---

## AI-Navigatable Interface

Every user action must have a command equivalent.

Examples:

* Create session
* Open terminal
* Split workspace
* Open diff viewer
* Create whiteboard card
* Generate codebase map

The AI should interact with the application through commands rather than simulated UI interactions.

---

## Local-First Architecture

Workspace data is stored locally and can optionally be source controlled.

Sessions, artifacts, logs, and board state are persisted to disk.

---

# Core Systems

## 1. Whiteboard System

The whiteboard is built using three primitives.

### Card

```ts
type Card = {
  id: string
  title: string
  content: string
  x: number
  y: number
}
```

### Edge

```ts
type Edge = {
  id: string
  from: string
  to: string
}
```

### Frame

```ts
type Frame = {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
}
```

Frames function similarly to Blender or Figma grouping regions.

Examples:

* Authentication Flow
* User Onboarding
* Billing System
* Backend Architecture

No additional node types should be introduced initially.

---

## 2. Whiteboard Command Protocol

AI agents interact with the whiteboard through operations.

Examples:

```json
{
  "op": "create_card"
}
```

```json
{
  "op": "move_card"
}
```

```json
{
  "op": "create_edge"
}
```

```json
{
  "op": "create_frame"
}
```

The protocol should be operation-based rather than state-based.

Benefits:

* Undo support
* Replay support
* Multiplayer readiness
* Easier AI integration
* Diff generation

---

## 3. Event Store

Workspace state is reconstructed from events.

Example:

```text
events.jsonl
```

```json
{"op":"create_card"}
{"op":"move_card"}
{"op":"create_edge"}
```

Benefits:

* Time travel
* Session recovery
* Workspace history
* Event replay
* Audit trail

---

## 4. Session System

Each workspace session receives a unique identifier.

Directory structure:

```text
.ai-whiteboard-cache/

  sessions/
    {session-id}/

      board.json
      events.jsonl

      artifacts/
      logs/
      snapshots/
      diffs/
```

Sessions can be committed to source control if desired.

---

# Artifact System

Artifacts are AI-generated project outputs.

Examples:

* architecture.md
* auth-flow.md
* migration-plan.md
* api-design.md

Artifacts are stored under:

```text
artifacts/
```

Artifacts should support:

* Version history
* Diff generation
* Markdown rendering

---

# Diff System

Changes to artifacts generate versions.

Example:

```text
v1
v2
v3
```

A dedicated diff viewer displays:

```diff
- old content
+ new content
```

The diff system should work independently of Git.

---

# Logging System

A dedicated log panel records workspace activity.

Examples:

```text
[12:30:21]
Created card:
Authentication

[12:30:25]
Connected:
Authentication -> Session

[12:31:00]
Generated:
auth-flow.md
```

The log panel acts as an execution history for both user and AI actions.

---

# Workspace Layout System

The UI layout should function similarly to Blender.

Layouts are composed of panels.

Supported layouts:

* Horizontal Split
* Vertical Split
* Tabs

Example:

```text
+-------------+----------+
| Whiteboard  | Diff     |
|             | Viewer   |
+-------------+----------+
| Terminal               |
+------------------------+
```

Layout state should be serializable.

---

# Terminal Integration

A terminal panel is a first-class feature.

Purpose:

* Run AI agents
* Execute commands
* Use external tooling
* Support custom workflows

Users may run:

* Claude Code
* OpenAI Agents
* Codex
* Local models
* Custom automation

The application should not require a specific AI harness.

---

# MCP Architecture

Two separate MCP servers should be provided.

---

## Workspace MCP

Controls the application.

Tools:

* create_card
* update_card
* move_card
* create_edge
* create_frame
* create_workspace
* open_panel
* read_artifact
* write_artifact
* read_logs

Purpose:

Allow AI agents to manipulate the workspace directly.

---

## Codebase MCP

Provides code intelligence.

Tools:

* read_file
* find_file
* find_symbol
* find_references
* find_callers
* find_callees
* semantic_search
* build_code_map

Purpose:

Allow efficient codebase understanding without reading the entire repository.

---

# Codebase Visualization

The whiteboard acts as the visualization engine.

Examples:

```text
AuthController
      |
AuthService
      |
SessionStore
```

Represented as:

* Cards
* Edges
* Frames

The same visualization primitives support:

* Feature planning
* Architecture diagrams
* Codebase maps
* Dependency graphs

This avoids maintaining separate visualization systems.

---

# Technology Stack

## Preferred Stack

Backend:

* Rust

UI:

* GPUI

Benefits:

* Native performance
* Tight integration
* Local-first architecture
* Strong tooling support

---

## Alternative Stack

Backend:

* Rust

Desktop:

* Tauri

Frontend:

* React
* React Flow

Benefits:

* Faster iteration
* Larger ecosystem
* Lower implementation risk

---

# Product Goal

The application should become a shared workspace where humans and AI agents collaboratively design, explore, document, and understand software systems through a visual, persistent, and navigable environment.

# Command Architecture

## Overview

The application is designed around a shared command layer.

Rather than allowing the UI, MCP server, or CLI to directly manipulate application state, all interactions are translated into commands that are executed by the core system.

This ensures a single source of truth for application behavior.

---

## Architectural Flow

```text
CLI
  \
   \
MCP -----> Command Layer -----> Core Domain
   /
  /
UI

Future:
- Scripts
- Automation
- Macros
- Testing Harnesses
```

All interfaces communicate with the application through the same command system.

---

## Why a Command Layer Exists

The command layer is not a network API.

It is an internal application contract.

Without a command layer:

```text
CLI -> Core
MCP -> Core
UI  -> Core
```

Each interface would need to implement:

* Validation
* Logging
* Event generation
* Undo handling
* Permission checks

This leads to duplicated logic and inconsistent behavior.

With a command layer:

```text
CLI
MCP
UI
Scripts
   ↓
Command Layer
   ↓
Core
```

All behavior passes through a single execution path.

---

## Command Lifecycle

Example:

User creates a card from the UI.

```text
Button Click
    ↓
CreateCard Command
    ↓
Validation
    ↓
Core State Update
    ↓
Event Creation
    ↓
Log Entry
```

The exact same flow is used for:

* MCP tool calls
* CLI commands
* Automation scripts
* Future macros

---

## Command Examples

```rust
enum Command {
    CreateCard,
    UpdateCard,
    DeleteCard,

    CreateEdge,
    DeleteEdge,

    CreateFrame,
    UpdateFrame,

    CreateSession,
    CloseSession,

    OpenPanel,
    ClosePanel,

    GenerateArtifact,
    BuildCodeMap,
}
```

Commands become the canonical language of the application.

---

## CLI Architecture

The CLI is treated as a primary interface for testing and automation.

Example:

```bash
whiteboard card create \
  --title "Authentication"
```

The CLI parser converts user input into:

```rust
Command::CreateCard
```

which is executed by the command layer.

The CLI does not directly modify application state.

---

## MCP Architecture

The MCP server acts as a translation layer.

Example MCP tool:

```json
{
  "tool": "create_card",
  "title": "Authentication"
}
```

Internally becomes:

```rust
Command::CreateCard
```

and follows the same execution path as the CLI and UI.

The MCP server should remain thin and contain minimal business logic.

---

## UI Architecture

User interactions are translated into commands.

Examples:

```text
Click New Card
```

becomes:

```rust
Command::CreateCard
```

```text
Open Terminal Panel
```

becomes:

```rust
Command::OpenPanel
```

The UI should never directly modify workspace state.

---

## Event Sourcing Integration

Each successful command generates one or more events.

Example:

```text
CreateCard Command
        ↓
CardCreated Event
```

Events are persisted to:

```text
events.jsonl
```

Benefits:

* Replay
* History
* Time travel
* Session recovery
* Auditing

---

## Logging Integration

Commands automatically generate log entries.

Example:

```text
[12:03:14]
Command:
CreateCard

Result:
Success

Card:
Authentication
```

This provides a consistent debugging and audit trail.

---

## Undo / Redo Integration

Because all mutations occur through commands, undo and redo become command-level operations.

Example:

```text
CreateCard
Undo
Redo
```

The command layer becomes the natural location for state reversal.

---

## Future Scripting System

A future scripting engine can be built entirely on top of commands.

Example:

```text
create frame "Authentication"

create card "Login"
create card "Session"

connect Login Session
```

The scripting engine simply translates script statements into commands.

No additional business logic is required.

---

## Project Structure

Suggested Rust workspace layout:

```text
crates/

core/
    cards.rs
    frames.rs
    sessions.rs
    artifacts.rs

commands/
    command.rs
    executor.rs

cli/
    parser.rs

mcp/
    server.rs

ui/
    gpui_frontend.rs
```

Execution flow:

```text
CLI
 ↓
Commands
 ↓
Core

MCP
 ↓
Commands
 ↓
Core

UI
 ↓
Commands
 ↓
Core
```

---

## Design Principle

The command layer is the canonical interface to the application.

The CLI, MCP server, UI, automation systems, and future integrations are all adapters that translate their respective inputs into commands.

This guarantees consistent behavior across every interaction surface and provides a strong foundation for AI-driven workspace manipulation.
