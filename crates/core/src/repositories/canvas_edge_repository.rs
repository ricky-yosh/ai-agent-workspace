use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::CanvasEdge;
use super::timestamps::{now_epoch_millis, epoch_millis_to_iso};

pub struct CanvasEdgeRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> CanvasEdgeRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        CanvasEdgeRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn create(
        &self,
        canvas_id: &str,
        source_node_id: &str,
        target_node_id: &str,
        label: Option<&str>,
        metadata_json: Option<&str>,
    ) -> Result<CanvasEdge, rusqlite::Error> {
        // Validate source node exists and belongs to the same canvas
        let source_canvas_id: String = self.conn.query_row(
            "SELECT canvas_id FROM canvas_nodes WHERE id = ?1",
            params![source_node_id],
            |row| row.get(0),
        ).map_err(|_| rusqlite::Error::QueryReturnedNoRows)?;

        if source_canvas_id != canvas_id {
            return Err(rusqlite::Error::InvalidParameterName(
                "source_node does not belong to this canvas".to_string()
            ));
        }

        // Validate target node exists and belongs to the same canvas
        let target_canvas_id: String = self.conn.query_row(
            "SELECT canvas_id FROM canvas_nodes WHERE id = ?1",
            params![target_node_id],
            |row| row.get(0),
        ).map_err(|_| rusqlite::Error::QueryReturnedNoRows)?;

        if target_canvas_id != canvas_id {
            return Err(rusqlite::Error::InvalidParameterName(
                "target_node does not belong to this canvas".to_string()
            ));
        }

        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        self.conn.execute(
            "INSERT INTO canvas_edges (id, canvas_id, source_node_id, target_node_id, label, metadata_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, canvas_id, source_node_id, target_node_id, label, metadata_json, now, now],
        )?;
        Ok(CanvasEdge {
            id,
            canvas_id: canvas_id.to_string(),
            source_node_id: source_node_id.to_string(),
            target_node_id: target_node_id.to_string(),
            label: label.map(|s| s.to_string()),
            metadata_json: metadata_json.map(|s| s.to_string()),
            created_at: epoch_millis_to_iso(now),
            updated_at: epoch_millis_to_iso(now),
        })
    }

    pub fn list_by_canvas(&self, canvas_id: &str) -> Result<Vec<CanvasEdge>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, canvas_id, source_node_id, target_node_id, label, metadata_json, created_at, updated_at
             FROM canvas_edges WHERE canvas_id = ?1
             ORDER BY created_at ASC"
        )?;
        let rows = stmt.query_map(params![canvas_id], |row| {
            let created: i64 = row.get(6)?;
            let updated: i64 = row.get(7)?;
            Ok(CanvasEdge {
                id: row.get(0)?,
                canvas_id: row.get(1)?,
                source_node_id: row.get(2)?,
                target_node_id: row.get(3)?,
                label: row.get(4)?,
                metadata_json: row.get(5)?,
                created_at: epoch_millis_to_iso(created),
                updated_at: epoch_millis_to_iso(updated),
            })
        })?;
        rows.collect()
    }

    pub fn get(&self, id: &str) -> Result<CanvasEdge, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, canvas_id, source_node_id, target_node_id, label, metadata_json, created_at, updated_at
             FROM canvas_edges WHERE id = ?1",
            params![id],
            |row| {
                let created: i64 = row.get(6)?;
                let updated: i64 = row.get(7)?;
                Ok(CanvasEdge {
                    id: row.get(0)?,
                    canvas_id: row.get(1)?,
                    source_node_id: row.get(2)?,
                    target_node_id: row.get(3)?,
                    label: row.get(4)?,
                    metadata_json: row.get(5)?,
                    created_at: epoch_millis_to_iso(created),
                    updated_at: epoch_millis_to_iso(updated),
                })
            },
        )
    }

    pub fn update(
        &self,
        id: &str,
        source_node_id: Option<&str>,
        target_node_id: Option<&str>,
        label: Option<&str>,
        metadata_json: Option<&str>,
    ) -> Result<CanvasEdge, rusqlite::Error> {
        let existing = self.get(id)?;
        let now = now_epoch_millis();

        let new_source = source_node_id.unwrap_or(&existing.source_node_id);
        let new_target = target_node_id.unwrap_or(&existing.target_node_id);
        let new_label = label.or(existing.label.as_deref());
        let new_metadata = metadata_json.or(existing.metadata_json.as_deref());

        self.conn.execute(
            "UPDATE canvas_edges SET source_node_id = ?1, target_node_id = ?2, label = ?3, metadata_json = ?4, updated_at = ?5
             WHERE id = ?6",
            params![new_source, new_target, new_label, new_metadata, now, id],
        )?;
        self.get(id)
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM canvas_edges WHERE id = ?1", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::repositories::test_helpers::*;

    #[test]
    fn test_create_edge_with_valid_nodes() {
        let db = setup_db();
        let (_, canvas_id, node1_id, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        let edge = repo.create(&canvas_id, &node1_id, &node2_id, Some("connects"), None).unwrap();
        assert_eq!(edge.source_node_id, node1_id);
        assert_eq!(edge.target_node_id, node2_id);
        assert_eq!(edge.label, Some("connects".to_string()));
        assert_eq!(edge.canvas_id, canvas_id);
        assert!(edge.metadata_json.is_none());
        assert!(!edge.id.is_empty());
    }

    #[test]
    fn test_create_edge_with_metadata() {
        let db = setup_db();
        let (_, canvas_id, node1_id, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        let metadata = r#"{"weight": 1.0, "type": "flow"}"#;
        let edge = repo.create(&canvas_id, &node1_id, &node2_id, None, Some(metadata)).unwrap();
        assert_eq!(edge.metadata_json, Some(metadata.to_string()));
    }

    #[test]
    fn test_reject_edge_with_mismatched_canvas_source() {
        let db = setup_db();
        let (_, _canvas_id1, node1_id, _) = create_test_canvas_with_nodes(&db);
        let (_, canvas_id2, _, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        // Try to create edge with source from canvas1 but target from canvas2
        // This should fail because source doesn't belong to canvas2
        let result = repo.create(&canvas_id2, &node1_id, &node2_id, None, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_reject_edge_with_mismatched_canvas_target() {
        let db = setup_db();
        let (_, canvas_id1, node1_id, _) = create_test_canvas_with_nodes(&db);
        let (_, _canvas_id2, _, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        // Try to create edge with target from canvas2 but source from canvas1
        // This should fail because target doesn't belong to canvas1
        let result = repo.create(&canvas_id1, &node1_id, &node2_id, None, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_list_returns_canvas_edges() {
        let db = setup_db();
        let (_, canvas_id, node1_id, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        repo.create(&canvas_id, &node1_id, &node2_id, Some("Edge 1"), None).unwrap();
        repo.create(&canvas_id, &node2_id, &node1_id, Some("Edge 2"), None).unwrap();

        let list = repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().all(|e| e.canvas_id == canvas_id));
    }

    #[test]
    fn test_list_excludes_other_canvas_edges() {
        let db = setup_db();
        let (_, canvas_id1, node1a_id, node1b_id) = create_test_canvas_with_nodes(&db);
        let (_, canvas_id2, node2a_id, node2b_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        repo.create(&canvas_id1, &node1a_id, &node1b_id, None, None).unwrap();
        repo.create(&canvas_id2, &node2a_id, &node2b_id, None, None).unwrap();

        let list1 = repo.list_by_canvas(&canvas_id1).unwrap();
        assert_eq!(list1.len(), 1);

        let list2 = repo.list_by_canvas(&canvas_id2).unwrap();
        assert_eq!(list2.len(), 1);
    }

    #[test]
    fn test_get_by_id() {
        let db = setup_db();
        let (_, canvas_id, node1_id, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        let edge = repo.create(&canvas_id, &node1_id, &node2_id, Some("Test"), None).unwrap();
        let fetched = repo.get(&edge.id).unwrap();
        assert_eq!(fetched.id, edge.id);
        assert_eq!(fetched.label, Some("Test".to_string()));
        assert_eq!(fetched.source_node_id, node1_id);
        assert_eq!(fetched.target_node_id, node2_id);
    }

    #[test]
    fn test_update_label() {
        let db = setup_db();
        let (_, canvas_id, node1_id, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        let edge = repo.create(&canvas_id, &node1_id, &node2_id, Some("Old Label"), None).unwrap();
        let updated = repo.update(&edge.id, None, None, Some("New Label"), None).unwrap();
        assert_eq!(updated.label, Some("New Label".to_string()));
    }

    #[test]
    fn test_delete_removes_edge() {
        let db = setup_db();
        let (_, canvas_id, node1_id, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        let edge = repo.create(&canvas_id, &node1_id, &node2_id, None, None).unwrap();
        repo.delete(&edge.id).unwrap();
        let result = repo.get(&edge.id);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_canvas_cascades_to_edges() {
        let db = setup_db();
        let (_, canvas_id, node1_id, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();

        {
            let repo = db.canvas_edges(&conn);
            repo.create(&canvas_id, &node1_id, &node2_id, None, None).unwrap();
        }

        // Delete the canvas
        let canvases = db.visual_canvases(&conn);
        canvases.delete(&canvas_id).unwrap();

        // Edges should be gone too
        let repo = db.canvas_edges(&conn);
        let remaining = repo.list_by_canvas(&canvas_id).unwrap();
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_list_ordered_by_created_at_asc() {
        let db = setup_db();
        let (_, canvas_id, node1_id, node2_id) = create_test_canvas_with_nodes(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_edges(&conn);

        let e1 = repo.create(&canvas_id, &node1_id, &node2_id, Some("First"), None).unwrap();
        let e2 = repo.create(&canvas_id, &node2_id, &node1_id, Some("Second"), None).unwrap();

        let list = repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, e1.id);
        assert_eq!(list[1].id, e2.id);
    }
}
