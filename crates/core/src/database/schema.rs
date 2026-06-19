pub const SCHEMA_VERSION: i32 = 3;

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
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_version_is_three() {
        assert_eq!(SCHEMA_VERSION, 3);
    }

    #[test]
    fn test_create_tables_is_idempotent_sql() {
        assert!(CREATE_TABLES.contains("IF NOT EXISTS"));
        assert!(CREATE_TABLES.contains("CREATE INDEX IF NOT EXISTS"));
    }
}
