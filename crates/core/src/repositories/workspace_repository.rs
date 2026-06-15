use std::path::PathBuf;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{WorkspaceInstance, LayoutTree};

pub struct WorkspaceRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> WorkspaceRepository<'a> {
    pub fn new(db_path: &PathBuf, conn: &'a Connection) -> Self {
        WorkspaceRepository {
            _db_path: db_path.clone(),
            conn,
        }
    }

    pub fn create(
        &self,
        session_id: &str,
        name: &str,
        template_id: &str,
        tree: LayoutTree,
    ) -> Result<WorkspaceInstance, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let tree_json = serde_json::to_string(&tree)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let template_id_opt = if template_id.is_empty() { None } else { Some(template_id) };
        self.conn.execute(
            "INSERT INTO workspaces (id, session_id, name, template_id, current_tree)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, session_id, name, template_id_opt, tree_json],
        )?;
        Ok(WorkspaceInstance {
            id,
            name: name.to_string(),
            template_id: template_id.to_string(),
            current_tree: tree,
        })
    }

    pub fn get(&self, id: &str) -> Result<WorkspaceInstance, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, template_id, current_tree FROM workspaces WHERE id = ?1",
        )?;
        stmt.query_row(params![id], |row| {
            let tree_json: String = row.get(3)?;
            let tree: LayoutTree = serde_json::from_str(&tree_json)
                .unwrap_or_else(|_| crate::domain::LayoutTree::default_layout());
            Ok(WorkspaceInstance {
                id: row.get(0)?,
                name: row.get(1)?,
                template_id: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                current_tree: tree,
            })
        })
    }

    pub fn list_by_session(&self, session_id: &str) -> Result<Vec<WorkspaceInstance>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, template_id, current_tree FROM workspaces WHERE session_id = ?1",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let tree_json: String = row.get(3)?;
            let tree: LayoutTree = serde_json::from_str(&tree_json)
                .unwrap_or_else(|_| crate::domain::LayoutTree::default_layout());
            Ok(WorkspaceInstance {
                id: row.get(0)?,
                name: row.get(1)?,
                template_id: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                current_tree: tree,
            })
        })?;
        rows.collect()
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        let affected = self.conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn update_tree(&self, id: &str, tree: &LayoutTree) -> Result<(), rusqlite::Error> {
        let tree_json = serde_json::to_string(tree)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let affected = self.conn.execute(
            "UPDATE workspaces SET current_tree = ?1 WHERE id = ?2",
            params![tree_json, id],
        )?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn rename(&self, id: &str, new_name: &str) -> Result<(), rusqlite::Error> {
        let affected = self.conn.execute(
            "UPDATE workspaces SET name = ?1 WHERE id = ?2",
            params![new_name, id],
        )?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn set_active(&self, session_id: &str, workspace_id: &str) -> Result<(), rusqlite::Error> {
        let now = chrono::Utc::now().timestamp_millis();
        let affected = self.conn.execute(
            "UPDATE sessions SET active_workspace_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![workspace_id, now, session_id],
        )?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn count_by_session(&self, session_id: &str) -> Result<i64, rusqlite::Error> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM workspaces WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use crate::database::Database;

    fn setup_db() -> Database {
        Database::new(":memory:".into())
    }

    fn default_tree() -> crate::domain::LayoutTree {
        crate::domain::LayoutTree::default_layout()
    }

    fn create_test_session(db: &Database, conn: &rusqlite::Connection) -> String {
        let sessions_repo = db.sessions(conn);
        let session = sessions_repo.create("/tmp", "Test").unwrap();
        session.id
    }

    #[test]
    fn test_create_workspace() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let session_id = create_test_session(&db, &conn);
        let repo = db.workspaces(&conn);
        let ws = repo.create(&session_id, "General", "", default_tree()).unwrap();
        assert_eq!(ws.name, "General");
        assert!(ws.template_id.is_empty());
    }

    #[test]
    fn test_list_by_session() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let session_id = create_test_session(&db, &conn);
        let repo = db.workspaces(&conn);
        repo.create(&session_id, "WS1", "", default_tree()).unwrap();
        repo.create(&session_id, "WS2", "", default_tree()).unwrap();
        let list = repo.list_by_session(&session_id).unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_get_workspace() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let session_id = create_test_session(&db, &conn);
        let repo = db.workspaces(&conn);
        let created = repo.create(&session_id, "Test", "", default_tree()).unwrap();
        let got = repo.get(&created.id).unwrap();
        assert_eq!(got.id, created.id);
    }

    #[test]
    fn test_delete_workspace() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let session_id = create_test_session(&db, &conn);
        let repo = db.workspaces(&conn);
        let created = repo.create(&session_id, "Test", "", default_tree()).unwrap();
        repo.delete(&created.id).unwrap();
        assert!(repo.get(&created.id).is_err());
    }

    #[test]
    fn test_update_tree() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let session_id = create_test_session(&db, &conn);
        let repo = db.workspaces(&conn);
        let created = repo.create(&session_id, "Test", "", default_tree()).unwrap();
        let new_tree = crate::domain::LayoutTree {
            tree: crate::domain::LayoutNode::Panel {
                panel_type: "tasks".into(),
                terminal_id: None,
            },
        };
        repo.update_tree(&created.id, &new_tree).unwrap();
        let got = repo.get(&created.id).unwrap();
        assert_eq!(got.current_tree, new_tree);
    }

    #[test]
    fn test_count_by_session() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let session_id = create_test_session(&db, &conn);
        let repo = db.workspaces(&conn);
        assert_eq!(repo.count_by_session(&session_id).unwrap(), 0);
        repo.create(&session_id, "WS1", "", default_tree()).unwrap();
        repo.create(&session_id, "WS2", "", default_tree()).unwrap();
        assert_eq!(repo.count_by_session(&session_id).unwrap(), 2);
    }

    #[test]
    fn test_rename_workspace() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let session_id = create_test_session(&db, &conn);
        let repo = db.workspaces(&conn);
        let created = repo.create(&session_id, "Old Name", "", default_tree()).unwrap();
        repo.rename(&created.id, "New Name").unwrap();
        let got = repo.get(&created.id).unwrap();
        assert_eq!(got.name, "New Name");
    }

    #[test]
    fn test_nullable_template_id() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let session_id = create_test_session(&db, &conn);

        let layout = {
            let repo = db.layouts(&conn);
            repo.create("General", default_tree(), false).unwrap()
        };

        let ws = {
            let repo = db.workspaces(&conn);
            repo.create(&session_id, "WS", &layout.id, default_tree()).unwrap()
        };

        assert_eq!(ws.template_id, layout.id);

        conn.execute("UPDATE workspaces SET template_id = NULL WHERE id = ?1", rusqlite::params![ws.id]).unwrap();

        {
            let repo = db.layouts(&conn);
            repo.delete(&layout.id).unwrap();
        }

        let got = {
            let repo = db.workspaces(&conn);
            repo.get(&ws.id).unwrap()
        };
        assert!(got.template_id.is_empty());
    }
}
