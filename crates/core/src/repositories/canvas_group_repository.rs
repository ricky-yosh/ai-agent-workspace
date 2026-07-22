use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::CanvasGroup;
use super::timestamps::{now_epoch_millis, epoch_millis_to_iso};

pub struct CanvasGroupRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> CanvasGroupRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        CanvasGroupRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn create(
        &self,
        canvas_id: &str,
        label: &str,
        node_ids_json: &str,
        metadata_json: Option<&str>,
    ) -> Result<CanvasGroup, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        self.conn.execute(
            "INSERT INTO canvas_groups (id, canvas_id, label, node_ids_json, metadata_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, canvas_id, label, node_ids_json, metadata_json, now, now],
        )?;
        Ok(CanvasGroup {
            id,
            canvas_id: canvas_id.to_string(),
            label: label.to_string(),
            node_ids_json: node_ids_json.to_string(),
            metadata_json: metadata_json.map(|s| s.to_string()),
            created_at: epoch_millis_to_iso(now),
            updated_at: epoch_millis_to_iso(now),
        })
    }

    pub fn list_by_canvas(&self, canvas_id: &str) -> Result<Vec<CanvasGroup>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, canvas_id, label, node_ids_json, metadata_json, created_at, updated_at
             FROM canvas_groups WHERE canvas_id = ?1
             ORDER BY created_at ASC"
        )?;
        let rows = stmt.query_map(params![canvas_id], |row| {
            let created: i64 = row.get(5)?;
            let updated: i64 = row.get(6)?;
            Ok(CanvasGroup {
                id: row.get(0)?,
                canvas_id: row.get(1)?,
                label: row.get(2)?,
                node_ids_json: row.get(3)?,
                metadata_json: row.get(4)?,
                created_at: epoch_millis_to_iso(created),
                updated_at: epoch_millis_to_iso(updated),
            })
        })?;
        rows.collect()
    }

    pub fn get(&self, id: &str) -> Result<CanvasGroup, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, canvas_id, label, node_ids_json, metadata_json, created_at, updated_at
             FROM canvas_groups WHERE id = ?1",
            params![id],
            |row| {
                let created: i64 = row.get(5)?;
                let updated: i64 = row.get(6)?;
                Ok(CanvasGroup {
                    id: row.get(0)?,
                    canvas_id: row.get(1)?,
                    label: row.get(2)?,
                    node_ids_json: row.get(3)?,
                    metadata_json: row.get(4)?,
                    created_at: epoch_millis_to_iso(created),
                    updated_at: epoch_millis_to_iso(updated),
                })
            },
        )
    }

    pub fn update(
        &self,
        id: &str,
        label: Option<&str>,
        node_ids_json: Option<&str>,
        metadata_json: Option<&str>,
    ) -> Result<CanvasGroup, rusqlite::Error> {
        let existing = self.get(id)?;
        let now = now_epoch_millis();

        let new_label = label.unwrap_or(&existing.label);
        let new_node_ids = node_ids_json.unwrap_or(&existing.node_ids_json);
        let new_metadata = metadata_json.or(existing.metadata_json.as_deref());

        self.conn.execute(
            "UPDATE canvas_groups SET label = ?1, node_ids_json = ?2, metadata_json = ?3, updated_at = ?4
             WHERE id = ?5",
            params![new_label, new_node_ids, new_metadata, now, id],
        )?;
        self.get(id)
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM canvas_groups WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Remove a node_id from all groups' node_ids_json on a given canvas.
    pub fn remove_node_from_all_groups(&self, canvas_id: &str, node_id: &str) -> Result<(), rusqlite::Error> {
        let groups = self.list_by_canvas(canvas_id)?;
        for group in groups {
            let mut node_ids: Vec<String> = serde_json::from_str(&group.node_ids_json)
                .unwrap_or_default();
            let before_len = node_ids.len();
            node_ids.retain(|id| id != node_id);
            if node_ids.len() != before_len {
                let new_json = serde_json::to_string(&node_ids).unwrap_or_else(|_| "[]".to_string());
                let now = now_epoch_millis();
                self.conn.execute(
                    "UPDATE canvas_groups SET node_ids_json = ?1, updated_at = ?2 WHERE id = ?3",
                    params![new_json, now, group.id],
                )?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::repositories::test_helpers::*;

    #[test]
    fn test_create_group_with_label_and_node_ids() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        let node_ids = r#"["node-1","node-2"]"#;
        let group = repo.create(&canvas_id, "My Group", node_ids, None).unwrap();
        assert_eq!(group.label, "My Group");
        assert_eq!(group.canvas_id, canvas_id);
        assert_eq!(group.node_ids_json, node_ids);
        assert!(group.metadata_json.is_none());
        assert!(!group.id.is_empty());
        assert_eq!(group.created_at, group.updated_at);
    }

    #[test]
    fn test_create_group_with_metadata() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        let metadata = r#"{"color": "green"}"#;
        let group = repo.create(&canvas_id, "Colored Group", "[]", Some(metadata)).unwrap();
        assert_eq!(group.metadata_json, Some(metadata.to_string()));
    }

    #[test]
    fn test_list_returns_canvas_groups() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        repo.create(&canvas_id, "Group 1", "[]", None).unwrap();
        repo.create(&canvas_id, "Group 2", "[]", None).unwrap();

        let list = repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().all(|g| g.canvas_id == canvas_id));
    }

    #[test]
    fn test_list_excludes_other_canvas_groups() {
        let db = setup_db();
        let (_, canvas_id1) = create_test_canvas(&db);
        let (_, canvas_id2) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        repo.create(&canvas_id1, "Group 1", "[]", None).unwrap();
        repo.create(&canvas_id2, "Group 2", "[]", None).unwrap();

        let list1 = repo.list_by_canvas(&canvas_id1).unwrap();
        assert_eq!(list1.len(), 1);
        assert_eq!(list1[0].label, "Group 1");

        let list2 = repo.list_by_canvas(&canvas_id2).unwrap();
        assert_eq!(list2.len(), 1);
        assert_eq!(list2[0].label, "Group 2");
    }

    #[test]
    fn test_get_by_id() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        let group = repo.create(&canvas_id, "Test Group", r#"["n1"]"#, None).unwrap();
        let fetched = repo.get(&group.id).unwrap();
        assert_eq!(fetched.id, group.id);
        assert_eq!(fetched.label, "Test Group");
        assert_eq!(fetched.node_ids_json, r#"["n1"]"#);
    }

    #[test]
    fn test_update_adds_removes_nodes() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        let group = repo.create(&canvas_id, "Group", r#"["a","b"]"#, None).unwrap();

        // Update node_ids to remove "b" and add "c"
        let new_node_ids = r#"["a","c"]"#;
        let updated = repo.update(&group.id, None, Some(new_node_ids), None).unwrap();
        assert_eq!(updated.node_ids_json, r#"["a","c"]"#);
        assert_eq!(updated.label, "Group"); // unchanged
    }

    #[test]
    fn test_update_label() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        let group = repo.create(&canvas_id, "Old Label", "[]", None).unwrap();
        let updated = repo.update(&group.id, Some("New Label"), None, None).unwrap();
        assert_eq!(updated.label, "New Label");
        assert_eq!(updated.node_ids_json, "[]"); // unchanged
    }

    #[test]
    fn test_delete_removes_group() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        let group = repo.create(&canvas_id, "Group", "[]", None).unwrap();
        repo.delete(&group.id).unwrap();
        let result = repo.get(&group.id);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_canvas_cascades_to_groups() {
        let db = setup_db();
        let (_session_id, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();

        {
            let repo = db.canvas_groups(&conn);
            repo.create(&canvas_id, "Group 1", "[]", None).unwrap();
            repo.create(&canvas_id, "Group 2", "[]", None).unwrap();
        }

        // Delete the canvas
        let canvases = db.visual_canvases(&conn);
        canvases.delete(&canvas_id).unwrap();

        // Groups should be gone too
        let repo = db.canvas_groups(&conn);
        let remaining = repo.list_by_canvas(&canvas_id).unwrap();
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_list_ordered_by_created_at_asc() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        let g1 = repo.create(&canvas_id, "First", "[]", None).unwrap();
        let g2 = repo.create(&canvas_id, "Second", "[]", None).unwrap();

        let list = repo.list_by_canvas(&canvas_id).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, g1.id);
        assert_eq!(list[1].id, g2.id);
    }

    #[test]
    fn test_remove_node_from_all_groups() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        // Create two groups that both contain nodes "a", "b", and "c"
        let group1 = repo.create(&canvas_id, "Group 1", r#"["a","b","c"]"#, None).unwrap();
        let group2 = repo.create(&canvas_id, "Group 2", r#"["a","c"]"#, None).unwrap();
        let group3 = repo.create(&canvas_id, "Group 3", r#"["d","e"]"#, None).unwrap();

        // Remove node "a" from all groups
        repo.remove_node_from_all_groups(&canvas_id, "a").unwrap();

        // Verify group1 no longer has "a"
        let g1 = repo.get(&group1.id).unwrap();
        let ids1: Vec<String> = serde_json::from_str(&g1.node_ids_json).unwrap();
        assert_eq!(ids1, vec!["b", "c"], "Group 1 should have node 'a' removed");

        // Verify group2 no longer has "a"
        let g2 = repo.get(&group2.id).unwrap();
        let ids2: Vec<String> = serde_json::from_str(&g2.node_ids_json).unwrap();
        assert_eq!(ids2, vec!["c"], "Group 2 should have node 'a' removed");

        // Verify group3 is unchanged (didn't contain "a")
        let g3 = repo.get(&group3.id).unwrap();
        let ids3: Vec<String> = serde_json::from_str(&g3.node_ids_json).unwrap();
        assert_eq!(ids3, vec!["d", "e"], "Group 3 should be unchanged");
    }

    #[test]
    fn test_remove_node_from_all_groups_noop() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_groups(&conn);

        let group = repo.create(&canvas_id, "Group", r#"["x","y"]"#, None).unwrap();

        // Remove a node that doesn't exist in any group — should be a no-op
        repo.remove_node_from_all_groups(&canvas_id, "nonexistent").unwrap();

        // Verify group is unchanged
        let g = repo.get(&group.id).unwrap();
        let ids: Vec<String> = serde_json::from_str(&g.node_ids_json).unwrap();
        assert_eq!(ids, vec!["x", "y"]);
    }
}
