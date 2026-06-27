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



    if current_version < SCHEMA_VERSION {
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


}
