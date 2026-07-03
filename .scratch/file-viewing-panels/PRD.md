# PRD: File Tree, File Viewer, and Diff Viewer Panels

## Problem Statement

Developers and AI agents working in this workspace have no way to browse or view files without leaving the application. To read a markdown document, inspect source code, or review git changes, users must switch to an external editor or terminal. This breaks the collaborative workflow — the AI can't open files for the user to review, and the user can't quickly inspect code the AI is working on. The workspace needs first-class file browsing and viewing as panel types that integrate with the existing split layout system.

## Solution

Add three new panel types to the workspace:

1. **File Tree Panel** — a navigable directory tree showing the session's working directory, with sensible filtering of common build/dependency directories.
2. **File Viewer Panel** — a tabbed viewer that renders markdown (using react-markdown) and code (with syntax highlighting via Shiki). Each panel instance has its own tab state. Supports virtualized rendering for large files with no size limit.
3. **Diff Viewer Panel** — a unified git diff viewer with syntax-highlighted additions and deletions.

All three panels share a common file content cache and syntax highlighting pipeline. The File Tree opens files in the last-focused File Viewer Panel; if none exists, one is created.

## User Stories

### File Tree Panel

1. As a developer, I want to see my project's directory structure in a tree panel, so that I can browse files without leaving the workspace.
2. As a developer, I want the tree to filter out `node_modules`, `.git`, `target`, `dist`, and other common build directories by default, so that the tree is useful out of the box.
3. As a developer, I want to expand and collapse directories, so that I can navigate the tree efficiently.
4. As a developer, I want to click a file in the tree and have it open in a File Viewer Panel, so that I can read the file contents.
5. As a developer, I want the tree to open files in the most recently focused File Viewer Panel, so that I can control which viewer receives the file.
6. As a developer, I want the tree to create a new File Viewer Panel if none exists when I click a file, so that the action always succeeds.
7. As a developer, I want the tree to show file icons based on file type, so that I can quickly identify file kinds.
8. As a developer, I want the tree to highlight the currently open file, so that I can see where I am in the project.
9. As a developer, I want the tree to update when files change on disk, so that it stays accurate.
10. As a developer, I want to toggle visibility of hidden/ignored files, so that I can see everything when needed.

### File Viewer Panel

11. As a developer, I want to view markdown files rendered with proper formatting, so that I can read documentation without leaving the workspace.
12. As a developer, I want to view code files with syntax highlighting, so that I can read source code comfortably.
13. As a developer, I want each File Viewer Panel to have its own tabs, so that I can have different files open in different panels.
14. As a developer, I want to open and close tabs within a panel, so that I can manage my viewing state.
15. As a developer, I want to use Cmd+Shift+P (or O) to open a file picker in the viewer, so that I can open files without the tree panel.
16. As a developer, I want the viewer to handle large files without freezing the UI, so that I can open any file in the project.
17. As a developer, I want to see plain text immediately when opening a file, with syntax highlighting applied asynchronously, so that there's no delay.
18. As a developer, I want syntax highlighting to be cached, so that revisiting a file is instant.
19. As a developer, I want the viewer to support ~20 common languages including TypeScript, Python, Rust, Go, Swift, and Objective-C, so that it works for most projects.
20. As a developer, I want to add custom language grammars via a config folder, so that I can support niche languages.
21. As a developer, I want markdown rendering to support GFM (GitHub Flavored Markdown), so that tables, task lists, and other GFM features work.
22. As a developer, I want code blocks within markdown to be syntax-highlighted, so that code snippets are readable.
23. As a developer, I want the AI to be able to open files in the viewer via MCP, so that the AI can show me files during our conversation.
24. As a developer, I want unsupported file types to render as plain text, so that I can still read any file.

### Diff Viewer Panel

25. As a developer, I want to view uncommitted git changes in a diff viewer, so that I can review what I've modified.
26. As a developer, I want to view staged changes in the diff viewer, so that I can review what I'm about to commit.
27. As a developer, I want the diff viewer to show a unified view with additions and deletions, so that I can see what changed.
28. As a developer, I want additions highlighted in green and deletions in red, so that I can visually distinguish change types.
29. As a developer, I want syntax highlighting in the diff viewer, so that the code is readable.
30. As a developer, I want the diff viewer to share the same file content cache as the File Viewer, so that performance is consistent.
31. As a developer, I want the diff viewer to use virtualized rendering, so that large diffs don't freeze the UI.
32. As a developer, I want the AI to be able to open diffs in the viewer via MCP, so that the AI can show me changes during our conversation.

### Shared Infrastructure

33. As a developer, I want a shared file content cache with LRU eviction and content fingerprinting, so that all viewer panels benefit from cached results.
34. As a developer, I want syntax highlighting to use Shiki for best quality, so that code looks like it does in VS Code.
35. As a developer, I want the rendering pipeline to be extensible by file extension, so that new file types can be added without changing core code.
36. As a developer, I want all viewer panels to use virtualized row rendering, so that performance is consistent regardless of file size.

### Fast-Follow (Not in v1)

37. As a developer, I want to drag tabs between File Viewer Panels, so that I can reorganize my viewing layout.
38. As a developer, I want to drag a tab to split a new viewer panel, so that I can quickly create side-by-side views.
39. As a developer, I want a side-by-side diff view, so that I can compare large rewrites more easily.
40. As a developer, I want to compare two arbitrary files (not git diffs), so that I can diff files outside of git.

## Implementation Decisions

### New Panel Types

Three new panel types registered via the existing `registerPanel()` pattern:

- `file-tree` — "File Tree"
- `file-viewer` — "File Viewer"
- `diff-viewer` — "Diff Viewer"

Each panel type is a React component that receives `PanelProps` and uses `usePanelContext()` for workspace/session/area context.

### Module Structure

```
src/
  file-panel/
    cache.ts                 — LRU cache with content fingerprinting
    useFileContent.ts        — hook: loads file, returns {content, highlighted, loading}
    virtualizer.ts           — row windowing logic (binary search based)
    languageRegistry.ts      — maps file extensions to Shiki language IDs
    FileTreePanel.tsx         — directory tree panel component
    FileTreePanel.css
    FileViewerPanel.tsx       — tabbed file viewer panel component
    FileViewerPanel.css
    DiffViewerPanel.tsx       — unified git diff viewer panel component
    DiffViewerPanel.css
    renderers/
      MarkdownRenderer.tsx    — renders markdown with react-markdown
      CodeRenderer.tsx        — renders code with syntax highlighting
      PlainTextRenderer.tsx   — fallback for unsupported file types
      DiffRenderer.tsx        — renders unified diff with highlighting
```

### File Content Cache

An in-memory LRU cache shared across all viewer panels:

- **Key:** `${filePath}:${contentHash}` where `contentHash` is an FNV-1a hash of file content
- **Value:** `{ raw: string, highlighted: Map<number, HighlightedLine> }` — raw content plus per-line highlighted tokens
- **Max entries:** 100 files
- **Eviction:** LRU — least recently used entries are dropped when the cache is full
- **Persistence:** None — cache is rebuilt from disk on app restart

The cache is a singleton module imported by all viewer panels.

### File Reading

A new Tauri command `read_file` that:

1. Takes `{ session_id: string, file_path: string }`
2. Resolves `file_path` relative to the session's working directory
3. Reads the file as UTF-8 (binary files return an error that the viewer catches and shows as "Binary file not supported")
4. Returns `{ content: string, size: number }`

The frontend `useFileContent` hook calls this command and populates the cache.

### Syntax Highlighting

Use **Shiki** (browser version) for syntax highlighting:

- Initialize a shared highlighter instance with `createHighlighter()`
- Load only the bundled languages (~20) on first use
- Highlight each file's content, producing HAST (HTML AST)
- Flatten HAST to per-line token arrays for virtualized rendering
- Cache highlighted results in the LRU cache keyed on content hash

**Bundled languages (v1):** JavaScript, TypeScript, Python, Rust, Go, Java, C, C++, HTML, CSS, JSON, YAML, TOML, Markdown, Shell/Bash, Swift, Objective-C, Kotlin, C#, Ruby, PHP, SQL

**Custom language support:** Users can drop Shiki grammar files (`.tmLanguage.json` or `.plist`) into `~/.config/ai-agent-workspace/languages/`. The language registry scans this folder on app start and merges custom grammars with bundled ones.

### Rendering Pipeline

The rendering pipeline maps file extensions to renderer components:

| Extension Pattern | Renderer |
|---|---|
| `*.md` | MarkdownRenderer |
| `*.{ts,tsx,js,jsx,py,rs,go,java,c,cpp,swift,kt,cs,rb,php,sql,html,css,json,yaml,yml,toml,sh,bash,zsh}` | CodeRenderer |
| Everything else | PlainTextRenderer |

The mapping is configurable — users can register custom renderers for new extensions via a config object.

### Virtualized Row Rendering

Use `@tanstack/react-virtual` for row-level virtualization:

- Each row is a single line of text (or a single diff line)
- Row heights are uniform (single-line) for code, variable for markdown
- Only visible rows plus a small overscan buffer are rendered in the DOM
- Top and bottom spacer elements maintain correct scroll height
- No file size limit — a 100MB file just means more rows to scroll

### Markdown Rendering

Use existing `react-markdown` and `remark-gfm` dependencies:

- Render markdown with GFM support (tables, task lists, strikethrough, autolinks)
- Code blocks within markdown use the same Shiki highlighting pipeline
- Custom component overrides for consistent styling (matching IssueTrackerPanel's existing overrides)

### File Tree Panel

- Renders a recursive tree of directories and files
- Uses `list_directory` Tauri command that returns `{ entries: Array<{ name, path, is_dir, is_hidden }> }`
- Default excludes: `node_modules`, `.git`, `target`, `dist`, `.next`, `__pycache__`, `.cache`, `build`, `out`, `.turbo`, `.parcel-cache`
- Toggle for showing hidden/ignored files
- Clicking a file calls `openFileInViewer(filePath)` which targets the last-focused File Viewer Panel
- If no File Viewer Panel exists, the tree splits itself to create one
- Tracks "last-focused viewer" via a workspace-level ref updated on viewer focus events

### Tab Management (File Viewer)

Each File Viewer Panel instance manages its own tabs:

- **State:** `{ tabs: Array<{ id, filePath, title }>, activeTabId: string | null }`
- **Open:** Adds a tab (or activates it if already open in this panel)
- **Close:** Removes a tab; activates the adjacent tab
- **Activate:** Switches the displayed file
- **Cmd+Shift+P/O:** Opens a file picker dialog (Tauri `@tauri-apps/plugin-dialog`) to select a file from the session's working directory

Tab state is local to the panel instance — not shared across viewer panels.

### Diff Viewer Panel

- Renders unified git diffs with syntax highlighting
- Uses a `get_git_diff` Tauri command that runs `git diff` (or `git diff --staged`) in the session's working directory and returns parsed diff output
- Each diff line is classified as addition (+), deletion (-), or context ( )
- Additions get a green background, deletions get a red background
- The diff content is syntax-highlighted using the same Shiki pipeline
- Uses the same virtualized row rendering as the File Viewer
- Tab state for viewing different diffs (e.g., staged vs. unstaged)

### Tauri Commands

New commands in `crates/commands/src/command.rs`:

- `ReadFile { session_id, file_path }` — reads a file from the session's working directory
- `ListDirectory { session_id, dir_path }` — lists directory contents with metadata
- `GetGitDiff { session_id, staged: bool }` — returns parsed git diff output

### MCP Integration

New MCP tools for AI agents to open files:

- `open_file(session_id, file_path)` — opens a file in a File Viewer Panel (emits a Tauri event that the frontend handles)
- `show_diff(session_id, file_path?, staged?)` — opens a diff in the Diff Viewer Panel

These tools emit Tauri events (`open-file-request`, `show-diff-request`) that the frontend listens for and routes to the appropriate panel.

### Shared Infrastructure Pattern

The `src/file-panel/cache.ts` and `src/file-panel/virtualizer.ts` modules are shared across all three panel types. The `useFileContent` hook is the primary interface:

```typescript
// Simplified interface
function useFileContent(filePath: string | null): {
  content: string | null;
  highlighted: HighlightedLine[] | null;
  loading: boolean;
  error: string | null;
}
```

This hook:
1. Checks the LRU cache by content hash
2. If miss, calls `read_file` Tauri command
3. Computes content hash (FNV-1a)
4. If cache miss on hash, runs Shiki highlighting async
5. Stores result in cache
6. Returns `{ content, highlighted, loading, error }`

## Testing Decisions

Good tests verify external behavior through the public interface, not implementation details. Follow existing test patterns in `src/IssueTrackerPanel.test.tsx`.

### Cache Tests (Required)

- `cache_stores_and_retrieves` — basic LRU put/get
- `cache_evicts_lru_when_full` — verify LRU eviction at max entries
- `cache_invalidates_on_content_change` — same file path with different content hash gets separate entry

### Virtualizer Tests (Required)

- `virtualizer_returns_visible_rows` — given a viewport and row count, returns correct slice
- `virtualizer_handles_empty_content` — returns empty slice for zero rows
- `virtualizer_computes_spacers` — top and bottom spacer heights are correct

### File Tree Tests (Required)

- `tree_excludes_default_directories` — node_modules, .git, target are filtered
- `tree_expands_and_collapses` — directory toggle works
- `tree_targets_last_focused_viewer` — click opens in correct viewer

### File Viewer Tests (Required)

- `viewer_opens_markdown_as_rendered` — .md files use MarkdownRenderer
- `viewer_opens_code_with_highlighting` — .rs/.ts files use CodeRenderer
- `viewer_opens_unknown_as_plain_text` — unknown extensions use PlainTextRenderer
- `viewer_tabs_are_independent` — two viewer panels have separate tab state
- `viewer_cmd_shift_p_opens_picker` — keyboard shortcut triggers file picker

### Diff Viewer Tests (Required)

- `diff_viewer_shows_additions_in_green` — addition lines have green background
- `diff_viewer_shows_deletions_in_red` — deletion lines have red background
- `diff_viewer_syntax_highlights_code` — diff content is highlighted

### Panel Registration Tests (Required)

- `file_tree_panel_registers` — `getPanel("file-tree")` returns a component
- `file_viewer_panel_registers` — `getPanel("file-viewer")` returns a component
- `diff_viewer_panel_registers` — `getPanel("diff-viewer")` returns a component

## Out of Scope

- **Editing** — File Viewer is read-only in v1. Editing is a future feature.
- **Drag-and-drop tabs** — Tab drag between viewer panels is a fast-follow.
- **Side-by-side diff** — Unified view only in v1. Side-by-side is a fast-follow.
- **File comparison** — Comparing two arbitrary files (not git diffs) is a fast-follow.
- **Binary file viewing** — Images, PDFs, and other binary files show "Binary file not supported" in v1.
- **File search** — Full-text search within files is a future feature.
- **File watching** — Real-time updates when files change on disk are a future feature.
- **Git history browsing** — Viewing diffs for specific commits is a future feature.
- **Performance benchmarking** — Formal benchmarks for large file handling are deferred.
- **Custom themes** — Shiki theme is fixed (dark+) in v1. Theme switching is a future feature.

## Further Notes

This PRD introduces three panel types that extend the existing panel system. The `registerPanel()` pattern already supports this — no changes to the panel registration infrastructure are needed.

The shared file content cache and syntax highlighting pipeline are designed to be reused by future panel types (e.g., a code map panel, an artifact viewer). The cache module and `useFileContent` hook are the primary extension points.

The File Tree Panel's "last-focused viewer" tracking uses a workspace-level ref that is updated whenever a File Viewer Panel receives focus. This same pattern could be extended for other cross-panel interactions.

The diff viewer's `get_git_diff` command is intentionally simple — it runs `git diff` and returns the output. More sophisticated diff parsing (hunks, line ranges, specific commits) can be added later without changing the panel's rendering layer.
