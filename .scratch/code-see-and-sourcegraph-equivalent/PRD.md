Problem Statement
AI agents and developers working in this workspace have no way to understand a codebase's structure without reading files one-by-one. There's no visual overview of how files and functions connect, and no programmatic way for AI agents to query code relationships (symbol definitions, references, call graphs). This forces agents to make many small grep/read calls, wasting tokens and context, and gives developers no spatial understanding of their code.
Solution
Build a Code Map feature with two surfaces:
1. Visual Code Map Panel — A new panel type (like terminals) that renders an interactive node-graph of the codebase. Shows files as nodes, with edges representing imports, function calls, and references. Developers can click to expand/collapse modules, search for symbols, and navigate the graph spatially.
2. Code Intelligence MCP Tools — Six MCP tools that give AI agents semantic access to the codebase: code_search, find_definition, find_references, call_graph, build_code_map, and read_file_symbols. These tools use the same code index that powers the visual panel.
The indexing layer uses tree-sitter for fast, local, multi-language parsing with a custom index format designed to be SCIP-compatible for future upgrade.
User Stories
Visual Code Map Panel
 1. As a developer, I want to open a Code Map panel alongside my terminals, so that I can see my codebase structure while I work
 2. As a developer, I want the Code Map to auto-generate from my project's source files, so that I don't have to manually maintain diagrams
 3. As a developer, I want to see files as nodes in a graph, so that I can understand the project layout spatially
 4. As a developer, I want edges between files to represent import/require relationships, so that I can see which files depend on which
 5. As a developer, I want to expand a file node to see its symbols (functions, classes, modules), so that I can drill into code structure
 6. As a developer, I want to see function call edges between symbol nodes, so that I can trace data flow through the codebase
 7. As a developer, I want to click a node and see its definition or source, so that I can navigate quickly
 8. As a developer, I want to search for a symbol by name and highlight it on the graph, so that I can find code quickly
 9. As a developer, I want to filter the graph by file type, module, or symbol kind, so that I can focus on relevant parts
10. As a developer, I want the graph to update incrementally when files change, so that it stays accurate without rebuilds
11. As a developer, I want to resize and rearrange the Code Map panel like any other panel in the split layout, so that it fits my workflow
12. As a developer, I want the Code Map to work with multiple languages (TypeScript, Rust, Python, Go, etc.), so that it's useful across projects
13. As a developer, I want to see a minimap or overview when zoomed in, so that I don't lose context
14. As a developer, I want to double-click a symbol node to open it in my terminal/editor, so that I can jump to code quickly
15. As a developer, I want the Code Map to show module/directory grouping, so that I can see architectural boundaries
Code Intelligence MCP Tools
16. As an AI agent, I want to search code by keyword or regex across all files in a session, so that I can find relevant code without reading every file
17. As an AI agent, I want to find the definition of a symbol (function, class, variable) by name, so that I can understand what code does
18. As an AI agent, I want to find all references to a symbol, so that I can understand the impact of changing it
19. As an AI agent, I want to get the call graph for a function (who it calls, who calls it), so that I can trace execution flow
20. As an AI agent, I want to build a code map (file tree + dependency graph) for a session, so that I can get a structural overview
21. As an AI agent, I want to read a file with symbol annotations (line numbers, symbol names, kinds), so that I can understand code structure without parsing it myself
22. As an AI agent, I want these tools to work against the same index that powers the visual panel, so that my queries and the developer's view are consistent
23. As an AI agent, I want the index to be available via both in-process MCP plugin and standalone MCP server, so that I can use code intelligence from any context
Indexing & Performance
24. As a developer, I want the initial index to build in under 5 seconds for a medium project (1000 files), so that it doesn't slow me down
25. As a developer, I want incremental index updates to take under 100ms per file change, so that the graph stays responsive
26. As a developer, I want the index to be persisted to disk, so that reopening a session doesn't require a full re-index
27. As a developer, I want the index to use tree-sitter for parsing, so that it supports many languages without external dependencies
28. As a developer, I want the index format to be designed for future SCIP compatibility, so that we can upgrade to precise code intelligence later
Implementation Decisions
New Crate: crates/code-analysis/
A new Rust crate providing the code intelligence engine. Responsibilities:
- Parsing: tree-sitter integration for multi-language source file parsing
- Symbol extraction: Extract functions, classes, modules, variables, types from AST
- Reference tracking: Resolve symbol definitions and usages across files
- Call graph: Build caller→callee relationships between functions
- Search index: In-memory index for full-text and symbol search
- Incremental updates: File watcher integration for live index updates
The crate exposes a CodeIndex struct as its primary interface:
- CodeIndex::build(workspace_dir, language_patterns) — full build
- CodeIndex::update(changed_files) — incremental update
- CodeIndex::search(query) — full-text/symbol search
- CodeIndex::find_definition(symbol_name) — locate definition
- CodeIndex::find_references(symbol_name) — find all usages
- CodeIndex::call_graph(function_name) — get callers/callees
- CodeIndex::file_symbols(file_path) — annotated symbol list
- CodeIndex::code_map() — serializable graph for visualization
Tree-Sitter Integration
- Use tree-sitter Rust crate with language grammars for: TypeScript/JavaScript, Rust, Python, Go, Java, C/C++, Ruby
- Language detection via file extension (leverages existing detect_project_type())
- Each language grammar provides node types for functions, classes, imports, calls, etc.
- Symbol extraction maps tree-sitter node types to a unified SymbolKind enum
Index Format
struct CodeIndex {
    files: HashMap<PathBuf, FileInfo>,
    symbols: HashMap<String, SymbolInfo>,     // symbol_id → info
    references: HashMap<String, Vec<Reference>>, // symbol_id → usages
    call_graph: HashMap<String, CallInfo>,     // function_id → callers/callees
}

struct SymbolInfo {
    id: String,
    name: String,
    kind: SymbolKind,   // Function, Class, Module, Variable, Type, Import
    file: PathBuf,
    line: usize,
    column: usize,
    span: (usize, usize), // byte range
}

struct Reference {
    file: PathBuf,
    line: usize,
    column: usize,
    kind: RefKind, // Definition, Usage, Import, Call
}
Index format is designed to be serializable to JSON for persistence and MCP tool responses. The schema is compatible with SCIP's symbol naming conventions for future upgrade path.
Command Layer Additions
New Command variants in crates/commands/src/command.rs:
- CodeIndexBuild { session_id } — trigger full index build
- CodeIndexSearch { session_id, query } — search the index
- CodeFindDefinition { session_id, symbol_name } — find definition
- CodeFindReferences { session_id, symbol_name } — find references
- CodeCallGraph { session_id, function_name } — get call graph
- CodeFileSymbols { session_id, file_path } — get annotated symbols
- CodeBuildMap { session_id } — get full code map graph
MCP Tool Additions
Six new tools in crates/mcp/src/lib.rs:
- code_search(session_id, query, filter?) → search results with file/line/symbol matches
- find_definition(session_id, symbol_name) → symbol info with file/line/span
- find_references(session_id, symbol_name) → list of reference locations
- call_graph(session_id, function_name) → { callers: ..., callees: ... }
- build_code_map(session_id) → serializable graph of files + symbols + edges
- read_file_symbols(session_id, file_path) → file contents with symbol annotations
Frontend: Code Map Panel
New panel type "code-map" registered in panelRegistry.tsx.
Component: src/CodeMapPanel.tsx
- Uses React Flow (reactflow) for interactive graph rendering
- Node types:
- fileNode — rectangle showing file name, icon by language, expand/collapse toggle
- symbolNode — smaller node showing function/class name, kind icon, colored by SymbolKind
- Edge types:
- importEdge — dashed line for import relationships
- callEdge — solid line for function calls
- referenceEdge — thin line for symbol references
- Interactions:
- Click node → show details panel / navigate to definition
- Double-click symbol → emit event to open in terminal/editor
- Search bar → highlight matching nodes
- Filter controls → toggle visibility by symbol kind or module
- Zoom/pan with minimap
Data flow:
- On mount, calls invoke("code_index_build", { sessionId }) to ensure index exists
- Subscribes to code-index-updated Tauri event for incremental updates
- Calls invoke("code_build_map", { sessionId }) to get graph data
- Renders graph using React Flow
Panel registration:
registerPanel("code-map", "Code Map", CodeMapPanel)
Index Persistence & File Watching
- Index stored at ~/Library/Application Support/AI Agent Workspace/code-index-{session_id}.json
- On session open: load persisted index, then file-watcher triggers incremental updates
- File watcher monitors the session's working directory for .rs, .ts, .js, .py, .go, etc.
- Debounced updates (200ms) to avoid thrashing during rapid edits
Language Support Priority
Language    tree-sitter grammar    Symbols    Imports
TypeScript/JavaScript    tree-sitter-typescript    ✅    ✅
Rust    tree-sitter-rust    ✅    ✅
Python    tree-sitter-python    ✅    ✅
Go    tree-sitter-go    ✅    ✅
Java    tree-sitter-java    ✅    ✅
C/C++    tree-sitter-c / tree-sitter-cpp    ✅    ✅
Ruby    tree-sitter-ruby    ✅    ✅
Unknown file types are skipped gracefully (included as file nodes with no symbol extraction).
Testing Decisions
- Unit tests for crates/code-analysis/: Each module (parser, symbols, references, call_graph, search) tested in isolation with fixture source files
- Integration tests: Full index build → query cycle against a small multi-file test project
- MCP tool tests: Mock AppState with pre-built index, verify tool responses match expected shapes
- Frontend snapshot tests: Code Map panel renders correctly with mock graph data
- Performance benchmarks: Index build time for 1000-file project, incremental update latency
- Existing test patterns: Follow crates/commands/src/executor.rs test style (fixture-based, assert on CommandResult shapes)
Out of Scope
- Git history visualization — no blame, commit activity, or change frequency overlays
- Cross-repo / monorepo support — MVP indexes a single session's working directory
- SCIP indexer binaries — tree-sitter only for now; SCIP upgrade is a future iteration
- LSP integration — no language server protocol; tree-sitter provides sufficient semantic info for MVP
- Collaborative/real-time code map — single-user per session
- Code map annotations/labels — no custom labels or color coding beyond symbol kind
- AI-generated insights on the graph — no auto-summarization or refactoring suggestions (just the MCP tools)
- Diff viewer — separate feature, not part of this PRD
- Whiteboard integration — the code map uses React Flow, not the planned card/edge whiteboard system. Integration with the whiteboard system is a future consideration.
Further Notes
This PRD covers the first version of code intelligence for the workspace. The two surfaces (visual panel + MCP tools) share the same underlying index, ensuring consistency. The tree-sitter approach is chosen for speed and local-first operation — no external services, no cloud dependency.
The index format is intentionally designed to be forward-compatible with SCIP, so when the time comes to add precise code intelligence (cross-repo, language-server-quality), the migration path is clear without rebuilding the infrastructure.
The Code Map panel fits naturally into the existing split layout system — it's just another panel type that can live alongside terminals, resized and rearranged freely. This means developers can have a terminal on the left and a code map on the right, or any other configuration that suits their workflow.
