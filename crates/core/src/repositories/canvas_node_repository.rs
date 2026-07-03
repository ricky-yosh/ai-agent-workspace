use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::CanvasNode;

fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn epoch_millis_to_iso(millis: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .unwrap_or_default();
    dt.to_rfc3339()
}

pub struct CanvasNodeRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> CanvasNodeRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        CanvasNodeRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn create(
        &self,
        canvas_id: &str,
        content: &str,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        metadata_json: Option<&str>,
    ) -> Result<CanvasNode, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        self.conn.execute(
            "INSERT INTO canvas_nodes (id, canvas_id, content, x, y, width, height, metadata_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, canvas_id, content, x, y, width, height, metadata_json, now, now],
        )?;
        Ok(CanvasNode {
            id,
            canvas_id: canvas_id.to_string(),
            content: content.to_string(),
            x,
            y,
            width,
            height,
            metadata_json: metadata_json.map(|s| s.to_string()),
            created_at: epoch_millis_to_iso(now),
            updated_at: epoch_millis_to_iso(now),
        })
    }

    pub fn list_by_canvas(&self, canvas_id: &str) -> Result<Vec<CanvasNode>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, canvas_id, content, x, y, width, height, metadata_json, created_at, updated_at
             FROM canvas_nodes WHERE canvas_id = ?1
             ORDER BY created_at ASC"
        )?;
        let rows = stmt.query_map(params![canvas_id], |row| {
            let created: i64 = row.get(8)?;
            let updated: i64 = row.get(9)?;
            Ok(CanvasNode {
                id: row.get(0)?,
                canvas_id: row.get(1)?,
                content: row.get(2)?,
                x: row.get(3)?,
                y: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                metadata_json: row.get(7)?,
                created_at: epoch_millis_to_iso(created),
                updated_at: epoch_millis_to_iso(updated),
            })
        })?;
        rows.collect()
    }

    pub fn get(&self, id: &str) -> Result<CanvasNode, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, canvas_id, content, x, y, width, height, metadata_json, created_at, updated_at
             FROM canvas_nodes WHERE id = ?1",
            params![id],
            |row| {
                let created: i64 = row.get(8)?;
                let updated: i64 = row.get(9)?;
                Ok(CanvasNode {
                    id: row.get(0)?,
                    canvas_id: row.get(1)?,
                    content: row.get(2)?,
                    x: row.get(3)?,
                    y: row.get(4)?,
                    width: row.get(5)?,
                    height: row.get(6)?,
                    metadata_json: row.get(7)?,
                    created_at: epoch_millis_to_iso(created),
                    updated_at: epoch_millis_to_iso(updated),
                })
            },
        )
    }

    pub fn update(
        &self,
        id: &str,
        content: Option<&str>,
        x: Option<f64>,
        y: Option<f64>,
        width: Option<f64>,
        height: Option<f64>,
        metadata_json: Option<&str>,
    ) -> Result<CanvasNode, rusqlite::Error> {
        let existing = self.get(id)?;
        let now = now_epoch_millis();
        
        let new_content = content.unwrap_or(&existing.content);
        let new_x = x.unwrap_or(existing.x);
        let new_y = y.unwrap_or(existing.y);
        let new_width = width.unwrap_or(existing.width);
        let new_height = height.unwrap_or(existing.height);
        let new_metadata = metadata_json.or(existing.metadata_json.as_deref());
        
        self.conn.execute(
            "UPDATE canvas_nodes SET content = ?1, x = ?2, y = ?3, width = ?4, height = ?5, metadata_json = ?6, updated_at = ?7
             WHERE id = ?8",
            params![new_content, new_x, new_y, new_width, new_height, new_metadata, now, id],
        )?;
        self.get(id)
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM canvas_nodes WHERE id = ?1", params![id])?;
        Ok(())
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

    #[test]
    fn test_create_node_with_content_and_position() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Hello World", 100.0, 200.0, 200.0, 100.0, None).unwrap();
        assert_eq!(node.content, "Hello World");
        assert_eq!(node.canvas_id, canvas_id);
        assert_eq!(node.x, 100.0);
        assert_eq!(node.y, 200.0);
        assert_eq!(node.width, 200.0);
        assert_eq!(node.height, 100.0);
        assert!(node.metadata_json.is_none());
        assert!(!node.id.is_empty());
        assert_eq!(node.created_at, node.updated_at);
    }

    #[test]
    fn test_create_node_with_metadata() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let metadata = r#"{"color": "blue", "type": "note"}"#;
        let node = repo.create(&canvas_id, "Note", 50.0, 50.0, 150.0, 80.0, Some(metadata)).unwrap();
        assert_eq!(node.metadata_json, Some(metadata.to_string()));
    }

    #[test]
    fn test_list_returns_canvas_nodes() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        repo.create(&canvas_id, "Node 1", 0.0, 0.0, 100.0, 50.0, None).unwrap();
        repo.create(&canvas_id, "Node 2", 100.0, 100.0, 150.0, 75.0, None).unwrap();

        let list = repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().all(|n| n.canvas_id == canvas_id));
    }

    #[test]
    fn test_list_excludes_other_canvas_nodes() {
        let db = setup_db();
        let (_, canvas_id1) = create_test_canvas(&db);
        let (_, canvas_id2) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        repo.create(&canvas_id1, "Node 1", 0.0, 0.0, 100.0, 50.0, None).unwrap();
        repo.create(&canvas_id2, "Node 2", 100.0, 100.0, 150.0, 75.0, None).unwrap();

        let list1 = repo.list_by_canvas(&canvas_id1).unwrap();
        assert_eq!(list1.len(), 1);
        assert_eq!(list1[0].content, "Node 1");

        let list2 = repo.list_by_canvas(&canvas_id2).unwrap();
        assert_eq!(list2.len(), 1);
        assert_eq!(list2[0].content, "Node 2");
    }

    #[test]
    fn test_get_by_id() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Test Node", 10.0, 20.0, 100.0, 50.0, None).unwrap();
        let fetched = repo.get(&node.id).unwrap();
        assert_eq!(fetched.id, node.id);
        assert_eq!(fetched.content, "Test Node");
        assert_eq!(fetched.x, 10.0);
        assert_eq!(fetched.y, 20.0);
    }

    #[test]
    fn test_update_position() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Node", 10.0, 20.0, 100.0, 50.0, None).unwrap();
        let updated = repo.update(&node.id, None, Some(300.0), Some(400.0), None, None, None).unwrap();
        assert_eq!(updated.x, 300.0);
        assert_eq!(updated.y, 400.0);
        assert_eq!(updated.content, "Node"); // unchanged
    }

    #[test]
    fn test_update_content() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Old Content", 0.0, 0.0, 100.0, 50.0, None).unwrap();
        let updated = repo.update(&node.id, Some("New Content"), None, None, None, None, None).unwrap();
        assert_eq!(updated.content, "New Content");
        assert_eq!(updated.x, 0.0); // unchanged
    }

    #[test]
    fn test_delete_removes_node() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Node", 0.0, 0.0, 100.0, 50.0, None).unwrap();
        repo.delete(&node.id).unwrap();
        let result = repo.get(&node.id);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_canvas_cascades_to_nodes() {
        let db = setup_db();
        let (_session_id, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        
        {
            let repo = db.canvas_nodes(&conn);
            repo.create(&canvas_id, "Node 1", 0.0, 0.0, 100.0, 50.0, None).unwrap();
            repo.create(&canvas_id, "Node 2", 100.0, 100.0, 150.0, 75.0, None).unwrap();
        }
        
        // Delete the canvas
        let canvases = db.visual_canvases(&conn);
        canvases.delete(&canvas_id).unwrap();
        
        // Nodes should be gone too
        let repo = db.canvas_nodes(&conn);
        let remaining = repo.list_by_canvas(&canvas_id).unwrap();
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_list_ordered_by_created_at_asc() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let n1 = repo.create(&canvas_id, "First", 0.0, 0.0, 100.0, 50.0, None).unwrap();
        let n2 = repo.create(&canvas_id, "Second", 100.0, 100.0, 150.0, 75.0, None).unwrap();

        let list = repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, n1.id);
        assert_eq!(list[1].id, n2.id);
    }
}
