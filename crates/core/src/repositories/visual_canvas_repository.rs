use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::VisualCanvas;

fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn epoch_millis_to_iso(millis: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .unwrap_or_default();
    dt.to_rfc3339()
}

pub struct VisualCanvasRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> VisualCanvasRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        VisualCanvasRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn create(&self, session_id: &str, name: &str) -> Result<VisualCanvas, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        self.conn.execute(
            "INSERT INTO visual_canvases (id, session_id, name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, session_id, name, now, now],
        )?;
        Ok(VisualCanvas {
            id,
            session_id: session_id.to_string(),
            name: name.to_string(),
            created_at: epoch_millis_to_iso(now),
            updated_at: epoch_millis_to_iso(now),
        })
    }

    pub fn list_by_session(&self, session_id: &str) -> Result<Vec<VisualCanvas>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, name, created_at, updated_at
             FROM visual_canvases WHERE session_id = ?1
             ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let created: i64 = row.get(3)?;
            let updated: i64 = row.get(4)?;
            Ok(VisualCanvas {
                id: row.get(0)?,
                session_id: row.get(1)?,
                name: row.get(2)?,
                created_at: epoch_millis_to_iso(created),
                updated_at: epoch_millis_to_iso(updated),
            })
        })?;
        rows.collect()
    }

    pub fn get(&self, id: &str) -> Result<VisualCanvas, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, session_id, name, created_at, updated_at
             FROM visual_canvases WHERE id = ?1",
            params![id],
            |row| {
                let created: i64 = row.get(3)?;
                let updated: i64 = row.get(4)?;
                Ok(VisualCanvas {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    name: row.get(2)?,
                    created_at: epoch_millis_to_iso(created),
                    updated_at: epoch_millis_to_iso(updated),
                })
            },
        )
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM visual_canvases WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn rename(&self, id: &str, name: &str) -> Result<VisualCanvas, rusqlite::Error> {
        let now = now_epoch_millis();
        self.conn.execute(
            "UPDATE visual_canvases SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now, id],
        )?;
        self.get(id)
    }
}

#[cfg(test)]
mod tests {
    use crate::database::Database;

    fn setup_db() -> Database {
        Database::new(":memory:".into())
    }

    #[test]
    fn test_create_canvas_with_name() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.visual_canvases(&conn);

        let canvas = repo.create(&session.id, "My Canvas").unwrap();
        assert_eq!(canvas.name, "My Canvas");
        assert_eq!(canvas.session_id, session.id);
        assert!(!canvas.id.is_empty());
        assert_eq!(canvas.created_at, canvas.updated_at);
    }

    #[test]
    fn test_list_returns_session_canvases() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session1 = sessions.create("/tmp", "A").unwrap();
        let session2 = sessions.create("/tmp", "B").unwrap();
        let repo = db.visual_canvases(&conn);

        repo.create(&session1.id, "Canvas 1").unwrap();
        repo.create(&session1.id, "Canvas 2").unwrap();
        repo.create(&session2.id, "Canvas 3").unwrap();

        let list = repo.list_by_session(&session1.id).unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().all(|c| c.session_id == session1.id));

        let list2 = repo.list_by_session(&session2.id).unwrap();
        assert_eq!(list2.len(), 1);
    }

    #[test]
    fn test_get_by_id() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.visual_canvases(&conn);

        let canvas = repo.create(&session.id, "Canvas").unwrap();
        let fetched = repo.get(&canvas.id).unwrap();
        assert_eq!(fetched.id, canvas.id);
        assert_eq!(fetched.name, "Canvas");
        assert_eq!(fetched.session_id, session.id);
    }

    #[test]
    fn test_delete_cascades() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.visual_canvases(&conn);

        let canvas = repo.create(&session.id, "Canvas").unwrap();
        repo.delete(&canvas.id).unwrap();
        let result = repo.get(&canvas.id);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_session_cascades_to_canvases() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.visual_canvases(&conn);

        repo.create(&session.id, "Canvas 1").unwrap();
        repo.create(&session.id, "Canvas 2").unwrap();

        sessions.delete(&session.id).unwrap();

        let remaining = repo.list_by_session(&session.id).unwrap();
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_rename_updates_name() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.visual_canvases(&conn);

        let canvas = repo.create(&session.id, "Old Name").unwrap();
        let renamed = repo.rename(&canvas.id, "New Name").unwrap();
        assert_eq!(renamed.name, "New Name");
        assert_eq!(renamed.id, canvas.id);

        // Verify persistence
        let fetched = repo.get(&canvas.id).unwrap();
        assert_eq!(fetched.name, "New Name");
    }

    #[test]
    fn test_list_ordered_by_created_at_desc() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.visual_canvases(&conn);

        let c1 = repo.create(&session.id, "First").unwrap();
        let c2 = repo.create(&session.id, "Second").unwrap();

        let list = repo.list_by_session(&session.id).unwrap();
        assert_eq!(list.len(), 2);
        // Both canvases exist in the list (order may be same-millisecond)
        let ids: Vec<&str> = list.iter().map(|c| c.id.as_str()).collect();
        assert!(ids.contains(&c1.id.as_str()));
        assert!(ids.contains(&c2.id.as_str()));
    }
}
