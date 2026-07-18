use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::CanvasNode;
use super::timestamps::{now_epoch_millis, epoch_millis_to_iso};

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
        title: &str,
        description: &str,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        metadata_json: Option<&str>,
        tags_json: Option<&str>,
    ) -> Result<CanvasNode, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        self.conn.execute(
            "INSERT INTO canvas_nodes (id, canvas_id, title, description, x, y, width, height, metadata_json, tags_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![id, canvas_id, title, description, x, y, width, height, metadata_json, tags_json, now, now],
        )?;
        Ok(CanvasNode {
            id,
            canvas_id: canvas_id.to_string(),
            title: title.to_string(),
            description: description.to_string(),
            x,
            y,
            width,
            height,
            metadata_json: metadata_json.map(|s| s.to_string()),
            tags_json: tags_json.map(|s| s.to_string()),
            created_at: epoch_millis_to_iso(now),
            updated_at: epoch_millis_to_iso(now),
        })
    }

    pub fn list_by_canvas(&self, canvas_id: &str) -> Result<Vec<CanvasNode>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, canvas_id, title, description, x, y, width, height, metadata_json, tags_json, created_at, updated_at
             FROM canvas_nodes WHERE canvas_id = ?1
             ORDER BY created_at ASC"
        )?;
        let rows = stmt.query_map(params![canvas_id], |row| {
            let created: i64 = row.get(10)?;
            let updated: i64 = row.get(11)?;
            Ok(CanvasNode {
                id: row.get(0)?,
                canvas_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                x: row.get(4)?,
                y: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
                metadata_json: row.get(8)?,
                tags_json: row.get(9)?,
                created_at: epoch_millis_to_iso(created),
                updated_at: epoch_millis_to_iso(updated),
            })
        })?;
        rows.collect()
    }

    pub fn get(&self, id: &str) -> Result<CanvasNode, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, canvas_id, title, description, x, y, width, height, metadata_json, tags_json, created_at, updated_at
             FROM canvas_nodes WHERE id = ?1",
            params![id],
            |row| {
                let created: i64 = row.get(10)?;
                let updated: i64 = row.get(11)?;
                Ok(CanvasNode {
                    id: row.get(0)?,
                    canvas_id: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    x: row.get(4)?,
                    y: row.get(5)?,
                    width: row.get(6)?,
                    height: row.get(7)?,
                    metadata_json: row.get(8)?,
                    tags_json: row.get(9)?,
                    created_at: epoch_millis_to_iso(created),
                    updated_at: epoch_millis_to_iso(updated),
                })
            },
        )
    }

    pub fn update(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        x: Option<f64>,
        y: Option<f64>,
        width: Option<f64>,
        height: Option<f64>,
        metadata_json: Option<&str>,
        tags_json: Option<&str>,
    ) -> Result<CanvasNode, rusqlite::Error> {
        let existing = self.get(id)?;
        let now = now_epoch_millis();

        let new_title = title.unwrap_or(&existing.title);
        let new_description = description.unwrap_or(&existing.description);
        let new_x = x.unwrap_or(existing.x);
        let new_y = y.unwrap_or(existing.y);
        let new_width = width.unwrap_or(existing.width);
        let new_height = height.unwrap_or(existing.height);
        let new_metadata = metadata_json.or(existing.metadata_json.as_deref());
        let new_tags = tags_json.or(existing.tags_json.as_deref());

        self.conn.execute(
            "UPDATE canvas_nodes SET title = ?1, description = ?2, x = ?3, y = ?4, width = ?5, height = ?6, metadata_json = ?7, tags_json = ?8, updated_at = ?9
             WHERE id = ?10",
            params![new_title, new_description, new_x, new_y, new_width, new_height, new_metadata, new_tags, now, id],
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
    use crate::repositories::test_helpers::*;

    fn default_desc() -> &'static str { "" }

    #[test]
    fn test_create_node_with_title_and_position() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Hello World", default_desc(), 100.0, 200.0, 200.0, 100.0, None, None).unwrap();
        assert_eq!(node.title, "Hello World");
        assert_eq!(node.description, "");
        assert_eq!(node.canvas_id, canvas_id);
        assert_eq!(node.x, 100.0);
        assert_eq!(node.y, 200.0);
        assert_eq!(node.width, 200.0);
        assert_eq!(node.height, 100.0);
        assert!(node.metadata_json.is_none());
        assert!(node.tags_json.is_none());
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
        let node = repo.create(&canvas_id, "Note", default_desc(), 50.0, 50.0, 150.0, 80.0, Some(metadata), None).unwrap();
        assert_eq!(node.metadata_json, Some(metadata.to_string()));
    }

    #[test]
    fn test_create_node_with_tags() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let tags = r#"["bug","urgent"]"#;
        let node = repo.create(&canvas_id, "Note", default_desc(), 0.0, 0.0, 150.0, 80.0, None, Some(tags)).unwrap();
        assert_eq!(node.tags_json, Some(tags.to_string()));
    }

    #[test]
    fn test_update_tags() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Node", default_desc(), 0.0, 0.0, 100.0, 50.0, None, None).unwrap();
        let updated = repo.update(&node.id, None, None, None, None, None, None, None, Some(r#"["a"]"#)).unwrap();
        assert_eq!(updated.tags_json, Some(r#"["a"]"#.to_string()));
    }

    #[test]
    fn test_list_returns_canvas_nodes() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        repo.create(&canvas_id, "Node 1", default_desc(), 0.0, 0.0, 100.0, 50.0, None, None).unwrap();
        repo.create(&canvas_id, "Node 2", default_desc(), 100.0, 100.0, 150.0, 75.0, None, None).unwrap();

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

        repo.create(&canvas_id1, "Node 1", default_desc(), 0.0, 0.0, 100.0, 50.0, None, None).unwrap();
        repo.create(&canvas_id2, "Node 2", default_desc(), 100.0, 100.0, 150.0, 75.0, None, None).unwrap();

        let list1 = repo.list_by_canvas(&canvas_id1).unwrap();
        assert_eq!(list1.len(), 1);
        assert_eq!(list1[0].title, "Node 1");

        let list2 = repo.list_by_canvas(&canvas_id2).unwrap();
        assert_eq!(list2.len(), 1);
        assert_eq!(list2[0].title, "Node 2");
    }

    #[test]
    fn test_get_by_id() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Test Node", default_desc(), 10.0, 20.0, 100.0, 50.0, None, None).unwrap();
        let fetched = repo.get(&node.id).unwrap();
        assert_eq!(fetched.id, node.id);
        assert_eq!(fetched.title, "Test Node");
        assert_eq!(fetched.x, 10.0);
        assert_eq!(fetched.y, 20.0);
    }

    #[test]
    fn test_update_position() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Node", default_desc(), 10.0, 20.0, 100.0, 50.0, None, None).unwrap();
        let updated = repo.update(&node.id, None, None, Some(300.0), Some(400.0), None, None, None, None).unwrap();
        assert_eq!(updated.x, 300.0);
        assert_eq!(updated.y, 400.0);
        assert_eq!(updated.title, "Node"); // unchanged
    }

    #[test]
    fn test_update_title() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Old Title", default_desc(), 0.0, 0.0, 100.0, 50.0, None, None).unwrap();
        let updated = repo.update(&node.id, Some("New Title"), None, None, None, None, None, None, None).unwrap();
        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.x, 0.0); // unchanged
    }

    #[test]
    fn test_delete_removes_node() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_nodes(&conn);

        let node = repo.create(&canvas_id, "Node", default_desc(), 0.0, 0.0, 100.0, 50.0, None, None).unwrap();
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
            repo.create(&canvas_id, "Node 1", default_desc(), 0.0, 0.0, 100.0, 50.0, None, None).unwrap();
            repo.create(&canvas_id, "Node 2", default_desc(), 100.0, 100.0, 150.0, 75.0, None, None).unwrap();
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

        let n1 = repo.create(&canvas_id, "First", default_desc(), 0.0, 0.0, 100.0, 50.0, None, None).unwrap();
        let n2 = repo.create(&canvas_id, "Second", default_desc(), 100.0, 100.0, 150.0, 75.0, None, None).unwrap();

        let list = repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, n1.id);
        assert_eq!(list[1].id, n2.id);
    }
}
