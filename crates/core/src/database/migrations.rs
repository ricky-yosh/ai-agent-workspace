use rusqlite::Connection;

use super::schema::{CREATE_TABLES, SCHEMA_VERSION};

#[derive(Debug, thiserror::Error)]
pub enum MigrationError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Schema version mismatch: expected {expected}, found {found}")]
    VersionMismatch { expected: i32, found: i32 },
}

pub type Result<T> = std::result::Result<T, MigrationError>;

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(CREATE_TABLES)?;

    let current_version: i32 = conn
        .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0);

    if current_version < 2 {
        // v1 -> v2: add built_in column to layouts
        let has_built_in: bool = conn
            .prepare("PRAGMA table_info(layouts)")
            .map(|mut stmt| {
                let cols: Vec<String> = stmt
                    .query_map([], |row| row.get(1))
                    .unwrap()
                    .filter_map(|r| r.ok())
                    .collect();
                cols.contains(&"built_in".to_string())
            })
            .unwrap_or(false);

        if !has_built_in {
            conn.execute_batch(
                "ALTER TABLE layouts ADD COLUMN built_in INTEGER NOT NULL DEFAULT 0;",
            )?;
        }
    }



    if current_version < 11 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS canvas_view_states (
                id TEXT PRIMARY KEY,
                canvas_id TEXT NOT NULL UNIQUE REFERENCES visual_canvases(id) ON DELETE CASCADE,
                offset_x REAL NOT NULL DEFAULT 0,
                offset_y REAL NOT NULL DEFAULT 0,
                zoom REAL NOT NULL DEFAULT 1.0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_canvas_view_states_canvas_id ON canvas_view_states(canvas_id);"
        )?;
    }

    if current_version < SCHEMA_VERSION {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS change_events (
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
            CREATE INDEX IF NOT EXISTS idx_change_events_unprocessed ON change_events(processed_at) WHERE processed_at IS NULL;"
        )?;

        conn.execute_batch(
            "CREATE TRIGGER IF NOT EXISTS issue_delete_trigger
            AFTER DELETE ON issues
            BEGIN
                INSERT INTO change_events (id, session_id, entity_type, entity_id, event_type, payload_json, created_at)
                VALUES (
                    lower(hex(randomblob(16))),
                    OLD.session_id,
                    'issue',
                    OLD.id,
                    'deleted',
                    json_object(
                        'id', OLD.id,
                        'session_id', OLD.session_id,
                        'number', OLD.number,
                        'title', OLD.title,
                        'body', OLD.body,
                        'state', OLD.state,
                        'labels', OLD.labels,
                        'author', OLD.author,
                        'created_at', OLD.created_at,
                        'updated_at', OLD.updated_at
                    ),
                    CAST((julianday('now') - 2440587.5) * 86400 * 1000 AS INTEGER)
                );
            END;"
        )?;

        if current_version == 0 {
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?1)",
                [SCHEMA_VERSION],
            )?;
        } else {
            conn.execute(
                "UPDATE schema_version SET version = ?1",
                [SCHEMA_VERSION],
            )?;
        }
    }

    if current_version < 16 {
        let has_containing_symbol: bool = conn
            .prepare("PRAGMA table_info(code_index)")
            .map(|mut stmt| {
                let cols: Vec<String> = stmt
                    .query_map([], |row| row.get(1))
                    .unwrap()
                    .filter_map(|r| r.ok())
                    .collect();
                cols.contains(&"containing_symbol".to_string())
            })
            .unwrap_or(false);

        if !has_containing_symbol {
            conn.execute_batch(
                "ALTER TABLE code_index ADD COLUMN containing_symbol TEXT;"
            )?;
        }
    }

    if current_version < 17 {
        // v16 -> v17: store embeddings as packed-f32 BLOB instead of JSON text.
        // code_vectors holds only rebuildable embeddings, so recreate the table
        // with the new column type; a reindex repopulates it.
        conn.execute_batch(
            "DROP TABLE IF EXISTS code_vectors;
             CREATE TABLE code_vectors (
                id TEXT PRIMARY KEY,
                repo_path TEXT NOT NULL,
                file_path TEXT NOT NULL,
                symbol_name TEXT NOT NULL,
                symbol_type TEXT NOT NULL,
                line_start INTEGER NOT NULL,
                line_end INTEGER NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding BLOB NOT NULL,
                created_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_code_vectors_repo_path ON code_vectors(repo_path);
             CREATE INDEX IF NOT EXISTS idx_code_vectors_repo_file ON code_vectors(repo_path, file_path);"
        )?;
    }

    if current_version < 18 {
        // v17 -> v18: add per-file content_fingerprint so index_repo can skip
        // unchanged files. code_vectors is rebuildable cache; recreate it.
        conn.execute_batch(
            "DROP TABLE IF EXISTS code_vectors;
             CREATE TABLE code_vectors (
                id TEXT PRIMARY KEY,
                repo_path TEXT NOT NULL,
                file_path TEXT NOT NULL,
                symbol_name TEXT NOT NULL,
                symbol_type TEXT NOT NULL,
                line_start INTEGER NOT NULL,
                line_end INTEGER NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding BLOB NOT NULL,
                content_fingerprint TEXT NOT NULL,
                created_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_code_vectors_repo_path ON code_vectors(repo_path);
             CREATE INDEX IF NOT EXISTS idx_code_vectors_repo_file ON code_vectors(repo_path, file_path);"
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn test_migrate_creates_tables() {
        let conn = setup_db();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(tables.contains(&"sessions".to_string()));
        assert!(tables.contains(&"workspaces".to_string()));
        assert!(tables.contains(&"layouts".to_string()));
        assert!(tables.contains(&"issues".to_string()));
        assert!(tables.contains(&"canvas_edges".to_string()));
        assert!(tables.contains(&"canvas_groups".to_string()));
        assert!(tables.contains(&"canvas_tags".to_string()));
        assert!(tables.contains(&"schema_version".to_string()));
    }

    #[test]
    fn test_migrate_creates_indices() {
        let conn = setup_db();
        let indices: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        assert!(indices.contains(&"idx_sessions_working_directory".to_string()));
        assert!(indices.contains(&"idx_workspaces_session_id".to_string()));
        assert!(indices.contains(&"idx_workspaces_template_id".to_string()));
    }

    #[test]
    fn test_migrate_sets_schema_version() {
        let conn = setup_db();
        let version: i32 = conn
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn test_migrate_is_idempotent() {
        let conn = setup_db();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();
        let version: i32 = conn
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
    }

    #[test]
    fn test_foreign_keys_enforced() {
        let conn = setup_db();
        let fk_enabled: bool = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert!(fk_enabled);
    }

    fn code_vectors_embedding_type(conn: &Connection) -> String {
        conn.prepare("PRAGMA table_info(code_vectors)")
            .unwrap()
            .query_map([], |row| {
                let name: String = row.get(1)?;
                let col_type: String = row.get(2)?;
                Ok((name, col_type))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .find(|(name, _)| name == "embedding")
            .map(|(_, col_type)| col_type)
            .expect("code_vectors should have an embedding column")
    }

    fn code_vectors_has_column(conn: &Connection, column: &str) -> bool {
        conn.prepare("PRAGMA table_info(code_vectors)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter_map(|r| r.ok())
            .any(|name| name == column)
    }

    #[test]
    fn test_code_vectors_embedding_is_blob_on_fresh_db() {
        let conn = setup_db();
        assert_eq!(code_vectors_embedding_type(&conn), "BLOB");
    }

    #[test]
    fn test_code_vectors_has_content_fingerprint_on_fresh_db() {
        let conn = setup_db();
        assert!(code_vectors_has_column(&conn, "content_fingerprint"));
    }

    #[test]
    fn test_migrate_converts_legacy_code_vectors_to_blob() {
        // Simulate a pre-v17 database whose code_vectors used embedding_json TEXT.
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE code_vectors (
                id TEXT PRIMARY KEY,
                repo_path TEXT NOT NULL,
                file_path TEXT NOT NULL,
                symbol_name TEXT NOT NULL,
                symbol_type TEXT NOT NULL,
                line_start INTEGER NOT NULL,
                line_end INTEGER NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE schema_version (version INTEGER NOT NULL);
            INSERT INTO schema_version (version) VALUES (16);",
        )
        .unwrap();

        migrate(&conn).unwrap();

        assert_eq!(code_vectors_embedding_type(&conn), "BLOB");
        assert!(code_vectors_has_column(&conn, "content_fingerprint"));
        assert!(
            !code_vectors_has_column(&conn, "embedding_json"),
            "legacy embedding_json column should be gone"
        );
    }
}
