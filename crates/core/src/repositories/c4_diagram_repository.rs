use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::C4Diagram;
use super::timestamps::{now_epoch_millis, epoch_millis_to_iso};

pub struct C4DiagramRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> C4DiagramRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        C4DiagramRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn create(&self, repo_path: &str, name: &str, diagram_json: &str) -> Result<C4Diagram, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        self.conn.execute(
            "INSERT INTO c4_diagrams (id, repo_path, name, diagram_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, repo_path, name, diagram_json, now, now],
        )?;
        Ok(C4Diagram {
            id,
            repo_path: repo_path.to_string(),
            name: name.to_string(),
            diagram_json: diagram_json.to_string(),
            created_at: epoch_millis_to_iso(now),
            updated_at: epoch_millis_to_iso(now),
        })
    }

    pub fn list_by_repo_path(&self, repo_path: &str) -> Result<Vec<C4Diagram>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_path, name, diagram_json, created_at, updated_at
             FROM c4_diagrams WHERE repo_path = ?1
             ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map(params![repo_path], |row| {
            let created: i64 = row.get(4)?;
            let updated: i64 = row.get(5)?;
            Ok(C4Diagram {
                id: row.get(0)?,
                repo_path: row.get(1)?,
                name: row.get(2)?,
                diagram_json: row.get(3)?,
                created_at: epoch_millis_to_iso(created),
                updated_at: epoch_millis_to_iso(updated),
            })
        })?;
        rows.collect()
    }

    pub fn get(&self, id: &str) -> Result<C4Diagram, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, repo_path, name, diagram_json, created_at, updated_at
             FROM c4_diagrams WHERE id = ?1",
            params![id],
            |row| {
                let created: i64 = row.get(4)?;
                let updated: i64 = row.get(5)?;
                Ok(C4Diagram {
                    id: row.get(0)?,
                    repo_path: row.get(1)?,
                    name: row.get(2)?,
                    diagram_json: row.get(3)?,
                    created_at: epoch_millis_to_iso(created),
                    updated_at: epoch_millis_to_iso(updated),
                })
            },
        )
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM c4_diagrams WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn rename(&self, id: &str, name: &str) -> Result<C4Diagram, rusqlite::Error> {
        let now = now_epoch_millis();
        self.conn.execute(
            "UPDATE c4_diagrams SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )?;
        self.get(id)
    }
}

#[cfg(test)]
mod tests {
    use crate::repositories::test_helpers::*;

    #[test]
    fn test_create_c4_diagram_with_name_and_json() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.c4_diagrams(&conn);

        let diagram_json = r#"{"nodes":[],"edges":[],"groups":[]}"#;
        let diagram = repo.create("/tmp/repo", "My Diagram", diagram_json).unwrap();
        assert_eq!(diagram.name, "My Diagram");
        assert_eq!(diagram.repo_path, "/tmp/repo");
        assert_eq!(diagram.diagram_json, diagram_json);
        assert!(!diagram.id.is_empty());
        assert_eq!(diagram.created_at, diagram.updated_at);
    }

    #[test]
    fn test_list_by_repo_path_returns_matching_diagrams() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.c4_diagrams(&conn);

        repo.create("/tmp/repo-a", "Diagram A1", "{}").unwrap();
        repo.create("/tmp/repo-a", "Diagram A2", "{}").unwrap();
        repo.create("/tmp/repo-b", "Diagram B1", "{}").unwrap();

        let list_a = repo.list_by_repo_path("/tmp/repo-a").unwrap();
        assert_eq!(list_a.len(), 2);
        assert!(list_a.iter().all(|d| d.repo_path == "/tmp/repo-a"));

        let list_b = repo.list_by_repo_path("/tmp/repo-b").unwrap();
        assert_eq!(list_b.len(), 1);
    }

    #[test]
    fn test_get_by_id() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.c4_diagrams(&conn);

        let diagram = repo.create("/tmp/repo", "Diagram", "{}").unwrap();
        let fetched = repo.get(&diagram.id).unwrap();
        assert_eq!(fetched.id, diagram.id);
        assert_eq!(fetched.name, "Diagram");
        assert_eq!(fetched.repo_path, "/tmp/repo");
    }

    #[test]
    fn test_delete_removes_diagram() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.c4_diagrams(&conn);

        let diagram = repo.create("/tmp/repo", "Diagram", "{}").unwrap();
        repo.delete(&diagram.id).unwrap();
        let result = repo.get(&diagram.id);
        assert!(result.is_err());
    }

    #[test]
    fn test_rename_updates_name_and_updated_at() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.c4_diagrams(&conn);

        let diagram = repo.create("/tmp/repo", "Old Name", "{}").unwrap();
        let renamed = repo.rename(&diagram.id, "New Name").unwrap();
        assert_eq!(renamed.name, "New Name");
        assert_eq!(renamed.id, diagram.id);

        let fetched = repo.get(&diagram.id).unwrap();
        assert_eq!(fetched.name, "New Name");
    }

    #[test]
    fn test_list_empty_for_unknown_repo_path() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.c4_diagrams(&conn);

        let list = repo.list_by_repo_path("/nonexistent/path").unwrap();
        assert!(list.is_empty());
    }
}
