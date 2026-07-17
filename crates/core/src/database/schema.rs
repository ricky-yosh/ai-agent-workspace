pub const SCHEMA_VERSION: i32 = 20;

pub const CREATE_TABLES: &str = r#"
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    working_directory TEXT NOT NULL,
    state TEXT NOT NULL,
    active_workspace_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_id TEXT REFERENCES layouts(id),
    current_tree TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS layouts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tree TEXT NOT NULL,
    built_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_working_directory ON sessions(working_directory);
CREATE INDEX IF NOT EXISTS idx_workspaces_session_id ON workspaces(session_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_template_id ON workspaces(template_id);

CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    state TEXT NOT NULL,
    labels TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_session_id_number ON issues(session_id, number);
CREATE INDEX IF NOT EXISTS idx_issues_session_id ON issues(session_id);

CREATE TABLE IF NOT EXISTS change_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    processed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_change_events_session_id ON change_events(session_id);
CREATE INDEX IF NOT EXISTS idx_change_events_unprocessed ON change_events(processed_at) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS visual_canvases (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visual_canvases_session_id ON visual_canvases(session_id);

CREATE TABLE IF NOT EXISTS canvas_nodes (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES visual_canvases(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    width REAL NOT NULL DEFAULT 200,
    height REAL NOT NULL DEFAULT 100,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_canvas_id ON canvas_nodes(canvas_id);

CREATE TABLE IF NOT EXISTS canvas_edges (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES visual_canvases(id) ON DELETE CASCADE,
    source_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    label TEXT,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canvas_edges_canvas_id ON canvas_edges(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_source_node_id ON canvas_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_canvas_edges_target_node_id ON canvas_edges(target_node_id);

CREATE TABLE IF NOT EXISTS canvas_groups (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES visual_canvases(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    node_ids_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canvas_groups_canvas_id ON canvas_groups(canvas_id);

CREATE TABLE IF NOT EXISTS canvas_tags (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canvas_tags_node_id ON canvas_tags(node_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_tags_node_id_tag ON canvas_tags(node_id, tag);

CREATE TABLE IF NOT EXISTS canvas_node_sources (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES canvas_nodes(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('file', 'link')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_node_sources_node_id ON canvas_node_sources(node_id);

CREATE TABLE IF NOT EXISTS canvas_view_states (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL UNIQUE REFERENCES visual_canvases(id) ON DELETE CASCADE,
    offset_x REAL NOT NULL DEFAULT 0,
    offset_y REAL NOT NULL DEFAULT 0,
    zoom REAL NOT NULL DEFAULT 1.0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canvas_view_states_canvas_id ON canvas_view_states(canvas_id);

CREATE TABLE IF NOT EXISTS c4_diagrams (
    id TEXT PRIMARY KEY,
    repo_path TEXT NOT NULL,
    name TEXT NOT NULL,
    diagram_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_c4_diagrams_repo_path ON c4_diagrams(repo_path);

CREATE TABLE IF NOT EXISTS code_index (
    id TEXT PRIMARY KEY,
    repo_path TEXT NOT NULL,
    file_path TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    symbol_type TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    end_line_number INTEGER,
    content_fingerprint TEXT NOT NULL,
    data_json TEXT,
    containing_symbol TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_code_index_repo_path ON code_index(repo_path);
CREATE INDEX IF NOT EXISTS idx_code_index_repo_file ON code_index(repo_path, file_path);
CREATE INDEX IF NOT EXISTS idx_code_index_symbol ON code_index(repo_path, symbol_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_code_index_repo_file_symbol_line ON code_index(repo_path, file_path, symbol_name, line_number);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_tables_includes_change_events() {
        assert!(CREATE_TABLES.contains("change_events"));
    }

    #[test]
    fn test_create_tables_includes_visual_canvases() {
        assert!(CREATE_TABLES.contains("visual_canvases"));
    }

    #[test]
    fn test_create_tables_includes_canvas_nodes() {
        assert!(CREATE_TABLES.contains("canvas_nodes"));
    }

    #[test]
    fn test_create_tables_includes_canvas_edges() {
        assert!(CREATE_TABLES.contains("canvas_edges"));
    }

    #[test]
    fn test_create_tables_includes_canvas_groups() {
        assert!(CREATE_TABLES.contains("canvas_groups"));
    }

    #[test]
    fn test_create_tables_includes_canvas_tags() {
        assert!(CREATE_TABLES.contains("canvas_tags"));
    }

    #[test]
    fn test_create_tables_includes_canvas_node_sources() {
        assert!(CREATE_TABLES.contains("canvas_node_sources"));
    }

    #[test]
    fn test_create_tables_includes_canvas_view_states() {
        assert!(CREATE_TABLES.contains("canvas_view_states"));
    }

    #[test]
    fn test_create_tables_includes_c4_diagrams() {
        assert!(CREATE_TABLES.contains("c4_diagrams"));
    }

    #[test]
    fn test_create_tables_includes_code_index() {
        assert!(CREATE_TABLES.contains("code_index"));
    }

    #[test]
    fn test_create_tables_excludes_code_vectors() {
        assert!(!CREATE_TABLES.contains("code_vectors"));
    }

    #[test]
    fn test_schema_version_is_twenty() {
        assert_eq!(SCHEMA_VERSION, 20);
    }

    #[test]
    fn test_create_tables_is_idempotent_sql() {
        assert!(CREATE_TABLES.contains("IF NOT EXISTS"));
        assert!(CREATE_TABLES.contains("CREATE INDEX IF NOT EXISTS"));
    }
}
