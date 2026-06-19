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

    if current_version < 3 {
        // v2 -> v3: convert LayoutTree JSON to Screen JSON in workspaces and layouts
        use crate::graph::convert_tree_to_screen;
        use crate::domain::{LayoutTree, Screen};

        // Migrate workspaces.current_tree
        let rows: Vec<(String, String)> = {
            let mut stmt = conn.prepare("SELECT id, current_tree FROM workspaces")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            rows.filter_map(|r| r.ok()).collect()
        };
        for (id, json) in rows {
            let screen = serde_json::from_str::<LayoutTree>(&json)
                .ok()
                .and_then(|tree| convert_tree_to_screen(&tree).ok())
                .or_else(|| serde_json::from_str::<Screen>(&json).ok())
                .unwrap_or_default();
            let screen_json = serde_json::to_string(&screen)
                .map_err(|e| MigrationError::Database(rusqlite::Error::InvalidParameterName(e.to_string())))?;
            conn.execute(
                "UPDATE workspaces SET current_tree = ?1 WHERE id = ?2",
                rusqlite::params![screen_json, id],
            )?;
        }

        // Migrate layouts.tree
        let rows: Vec<(String, String)> = {
            let mut stmt = conn.prepare("SELECT id, tree FROM layouts")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            rows.filter_map(|r| r.ok()).collect()
        };
        for (id, json) in rows {
            let screen = serde_json::from_str::<LayoutTree>(&json)
                .ok()
                .and_then(|tree| convert_tree_to_screen(&tree).ok())
                .or_else(|| serde_json::from_str::<Screen>(&json).ok())
                .unwrap_or_default();
            let screen_json = serde_json::to_string(&screen)
                .map_err(|e| MigrationError::Database(rusqlite::Error::InvalidParameterName(e.to_string())))?;
            conn.execute(
                "UPDATE layouts SET tree = ?1 WHERE id = ?2",
                rusqlite::params![screen_json, id],
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

    #[test]
    fn test_migrate_v2_to_v3_converts_layout_tree_to_screen() {
        let conn = Connection::open_in_memory().unwrap();
        // Manually create schema at v2
        conn.execute_batch(CREATE_TABLES).unwrap();
        conn.execute("INSERT INTO schema_version (version) VALUES (2)", []).unwrap();

        // Need a session for FK
        conn.execute(
            "INSERT INTO sessions (id, name, working_directory, state, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params!["sess1", "Test", "/tmp", "Running", 0, 0],
        ).unwrap();

        // Insert a workspace with LayoutTree JSON (NULL template_id to avoid FK constraint)
        let layout_tree_json = r#"{"tree":{"panel":{"panel_type":"terminal","terminal_id":null}}}"#;
        conn.execute(
            "INSERT INTO workspaces (id, session_id, name, template_id, current_tree) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["ws1", "sess1", "Test", rusqlite::types::Null, layout_tree_json],
        ).unwrap();

        // Insert a layout with LayoutTree JSON
        let layout_tree_json2 = r#"{"tree":{"split":{"direction":"vertical","ratio":0.5,"children":[{"panel":{"panel_type":"terminal","terminal_id":null}},{"panel":{"panel_type":"blank","terminal_id":null}}]}}}"#;
        conn.execute(
            "INSERT INTO layouts (id, name, tree, built_in, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params!["lay1", "Two Pane", layout_tree_json2, 0, 0, 0],
        ).unwrap();

        // Run migration
        migrate(&conn).unwrap();

        // Verify version is 3
        let version: i32 = conn.query_row("SELECT version FROM schema_version", [], |row| row.get(0)).unwrap();
        assert_eq!(version, 3);

        // Verify the workspace's current_tree now contains Screen JSON
        let json: String = conn.query_row(
            "SELECT current_tree FROM workspaces WHERE id = ?1",
            rusqlite::params!["ws1"],
            |row| row.get(0),
        ).unwrap();
        assert!(json.contains("vertices"), "Expected Screen JSON in workspace, got: {}", json);
        assert!(json.contains("edges"), "Expected Screen JSON in workspace, got: {}", json);
        assert!(json.contains("areas"), "Expected Screen JSON in workspace, got: {}", json);

        // Verify the layout's tree now contains Screen JSON (split layout should have 2 areas)
        let layout_json: String = conn.query_row(
            "SELECT tree FROM layouts WHERE id = ?1",
            rusqlite::params!["lay1"],
            |row| row.get(0),
        ).unwrap();
        assert!(layout_json.contains("vertices"), "Expected Screen JSON in layout, got: {}", layout_json);
        assert!(layout_json.contains("areas"), "Expected Screen JSON in layout, got: {}", layout_json);
        // The two-pane split should produce 2 areas
        assert!(layout_json.contains(r#""panel_type":"terminal""#), "Expected terminal area, got: {}", layout_json);
        assert!(layout_json.contains(r#""panel_type":"blank""#), "Expected blank area, got: {}", layout_json);
    }
}
