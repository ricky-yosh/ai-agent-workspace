use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::CanvasTag;

fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn epoch_millis_to_iso(millis: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .unwrap_or_default();
    dt.to_rfc3339()
}

pub struct CanvasTagRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> CanvasTagRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        CanvasTagRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn add(&self, node_id: &str, tag: &str) -> Result<CanvasTag, rusqlite::Error> {
        // Check for existing tag first
        let existing: Result<CanvasTag, _> = self.conn.query_row(
            "SELECT id, node_id, tag, created_at FROM canvas_tags WHERE node_id = ?1 AND tag = ?2",
            params![node_id, tag],
            |row| {
                let created: i64 = row.get(3)?;
                Ok(CanvasTag {
                    id: row.get(0)?,
                    node_id: row.get(1)?,
                    tag: row.get(2)?,
                    created_at: epoch_millis_to_iso(created),
                })
            },
        );
        if let Ok(existing) = existing {
            return Ok(existing);
        }

        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        match self.conn.execute(
            "INSERT INTO canvas_tags (id, node_id, tag, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, node_id, tag, now],
        ) {
            Ok(_) => Ok(CanvasTag {
                id,
                node_id: node_id.to_string(),
                tag: tag.to_string(),
                created_at: epoch_millis_to_iso(now),
            }),
            Err(rusqlite::Error::SqliteFailure(err, _))
                if err.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                // Race condition: another thread inserted between our check and insert
                self.conn.query_row(
                    "SELECT id, node_id, tag, created_at FROM canvas_tags WHERE node_id = ?1 AND tag = ?2",
                    params![node_id, tag],
                    |row| {
                        let created: i64 = row.get(3)?;
                        Ok(CanvasTag {
                            id: row.get(0)?,
                            node_id: row.get(1)?,
                            tag: row.get(2)?,
                            created_at: epoch_millis_to_iso(created),
                        })
                    },
                )
            }
            Err(e) => Err(e),
        }
    }

    pub fn remove(&self, node_id: &str, tag: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM canvas_tags WHERE node_id = ?1 AND tag = ?2",
            params![node_id, tag],
        )?;
        Ok(())
    }

    pub fn list_by_node(&self, node_id: &str) -> Result<Vec<CanvasTag>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, node_id, tag, created_at FROM canvas_tags WHERE node_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![node_id], |row| {
            let created: i64 = row.get(3)?;
            Ok(CanvasTag {
                id: row.get(0)?,
                node_id: row.get(1)?,
                tag: row.get(2)?,
                created_at: epoch_millis_to_iso(created),
            })
        })?;
        rows.collect()
    }

    pub fn list_by_canvas(&self, canvas_id: &str) -> Result<Vec<CanvasTag>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.node_id, t.tag, t.created_at
             FROM canvas_tags t
             INNER JOIN canvas_nodes n ON t.node_id = n.id
             WHERE n.canvas_id = ?1
             ORDER BY t.created_at ASC",
        )?;
        let rows = stmt.query_map(params![canvas_id], |row| {
            let created: i64 = row.get(3)?;
            Ok(CanvasTag {
                id: row.get(0)?,
                node_id: row.get(1)?,
                tag: row.get(2)?,
                created_at: epoch_millis_to_iso(created),
            })
        })?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use crate::database::Database;

    fn setup_db() -> Database {
        Database::new(":memory:".into())
    }

    fn create_test_canvas(db: &Database) -> (String, String) {
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let canvases = db.visual_canvases(&conn);
        let canvas = canvases.create(&session.id, "Test Canvas").unwrap();
        (session.id, canvas.id)
    }

    fn create_test_node(db: &Database, canvas_id: &str) -> String {
        let conn = db.connection().unwrap();
        let nodes = db.canvas_nodes(&conn);
        let node = nodes.create(canvas_id, "Test Node", 0.0, 0.0, 100.0, 50.0, None).unwrap();
        node.id
    }

    #[test]
    fn test_add_tag() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let node_id = create_test_node(&db, &canvas_id);
        let conn = db.connection().unwrap();
        let repo = db.canvas_tags(&conn);

        let tag = repo.add(&node_id, "important").unwrap();
        assert_eq!(tag.node_id, node_id);
        assert_eq!(tag.tag, "important");
        assert!(!tag.id.is_empty());
    }

    #[test]
    fn test_add_duplicate_tag_is_idempotent() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let node_id = create_test_node(&db, &canvas_id);
        let conn = db.connection().unwrap();
        let repo = db.canvas_tags(&conn);

        let tag1 = repo.add(&node_id, "bug").unwrap();
        let tag2 = repo.add(&node_id, "bug").unwrap();
        assert_eq!(tag1.id, tag2.id);
    }

    #[test]
    fn test_remove_tag() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let node_id = create_test_node(&db, &canvas_id);
        let conn = db.connection().unwrap();
        let repo = db.canvas_tags(&conn);

        repo.add(&node_id, "bug").unwrap();
        repo.remove(&node_id, "bug").unwrap();
        let tags = repo.list_by_node(&node_id).unwrap();
        assert!(tags.is_empty());
    }

    #[test]
    fn test_list_by_node() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let node_id = create_test_node(&db, &canvas_id);
        let conn = db.connection().unwrap();
        let repo = db.canvas_tags(&conn);

        repo.add(&node_id, "bug").unwrap();
        repo.add(&node_id, "urgent").unwrap();
        let tags = repo.list_by_node(&node_id).unwrap();
        assert_eq!(tags.len(), 2);
        assert!(tags.iter().any(|t| t.tag == "bug"));
        assert!(tags.iter().any(|t| t.tag == "urgent"));
    }

    #[test]
    fn test_list_by_canvas() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let node_id1 = create_test_node(&db, &canvas_id);
        let node_id2 = create_test_node(&db, &canvas_id);
        let conn = db.connection().unwrap();
        let repo = db.canvas_tags(&conn);

        repo.add(&node_id1, "bug").unwrap();
        repo.add(&node_id2, "feature").unwrap();
        let tags = repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(tags.len(), 2);
        assert!(tags.iter().any(|t| t.tag == "bug"));
        assert!(tags.iter().any(|t| t.tag == "feature"));
    }

    #[test]
    fn test_remove_nonexistent_tag_is_noop() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let node_id = create_test_node(&db, &canvas_id);
        let conn = db.connection().unwrap();
        let repo = db.canvas_tags(&conn);

        // Should not error
        repo.remove(&node_id, "nonexistent").unwrap();
    }

    #[test]
    fn test_delete_node_cascades_to_tags() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let node_id = create_test_node(&db, &canvas_id);
        let conn = db.connection().unwrap();

        {
            let repo = db.canvas_tags(&conn);
            repo.add(&node_id, "bug").unwrap();
            repo.add(&node_id, "urgent").unwrap();
        }

        // Delete the node
        let nodes = db.canvas_nodes(&conn);
        nodes.delete(&node_id).unwrap();

        // Tags should be gone
        let repo = db.canvas_tags(&conn);
        let remaining = repo.list_by_node(&node_id).unwrap();
        assert!(remaining.is_empty());
    }
}
