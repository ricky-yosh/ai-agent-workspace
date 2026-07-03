use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::CanvasViewState;

fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn epoch_millis_to_iso(millis: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .unwrap_or_default();
    dt.to_rfc3339()
}

pub struct CanvasViewStateRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> CanvasViewStateRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        CanvasViewStateRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn get_by_canvas(&self, canvas_id: &str) -> Result<Option<CanvasViewState>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, canvas_id, offset_x, offset_y, zoom, created_at, updated_at
             FROM canvas_view_states WHERE canvas_id = ?1"
        )?;
        let mut rows = stmt.query_map(params![canvas_id], |row| {
            let created: i64 = row.get(5)?;
            let updated: i64 = row.get(6)?;
            Ok(CanvasViewState {
                id: row.get(0)?,
                canvas_id: row.get(1)?,
                offset_x: row.get(2)?,
                offset_y: row.get(3)?,
                zoom: row.get(4)?,
                created_at: epoch_millis_to_iso(created),
                updated_at: epoch_millis_to_iso(updated),
            })
        })?;
        match rows.next() {
            Some(row) => row.map(Some),
            None => Ok(None),
        }
    }

    pub fn upsert(
        &self,
        canvas_id: &str,
        offset_x: f64,
        offset_y: f64,
        zoom: f64,
    ) -> Result<CanvasViewState, rusqlite::Error> {
        let now = now_epoch_millis();

        // Try to get existing record
        if let Some(existing) = self.get_by_canvas(canvas_id)? {
            self.conn.execute(
                "UPDATE canvas_view_states SET offset_x = ?1, offset_y = ?2, zoom = ?3, updated_at = ?4
                 WHERE canvas_id = ?5",
                params![offset_x, offset_y, zoom, now, canvas_id],
            )?;
        } else {
            let id = Uuid::new_v4().to_string();
            self.conn.execute(
                "INSERT INTO canvas_view_states (id, canvas_id, offset_x, offset_y, zoom, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, canvas_id, offset_x, offset_y, zoom, now, now],
            )?;
        }

        self.get_by_canvas(canvas_id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)
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
    fn test_get_returns_none_when_no_view_state() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_view_states(&conn);

        let result = repo.get_by_canvas(&canvas_id).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_upsert_creates_new_view_state() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_view_states(&conn);

        let state = repo.upsert(&canvas_id, 100.0, 200.0, 1.5).unwrap();
        assert_eq!(state.canvas_id, canvas_id);
        assert_eq!(state.offset_x, 100.0);
        assert_eq!(state.offset_y, 200.0);
        assert_eq!(state.zoom, 1.5);
        assert_eq!(state.created_at, state.updated_at);
    }

    #[test]
    fn test_upsert_updates_existing_view_state() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_view_states(&conn);

        let first = repo.upsert(&canvas_id, 10.0, 20.0, 1.0).unwrap();
        let second = repo.upsert(&canvas_id, 300.0, 400.0, 2.0).unwrap();

        assert_eq!(second.id, first.id, "Should reuse the same record");
        assert_eq!(second.offset_x, 300.0);
        assert_eq!(second.offset_y, 400.0);
        assert_eq!(second.zoom, 2.0);
    }

    #[test]
    fn test_get_returns_persisted_values() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();
        let repo = db.canvas_view_states(&conn);

        repo.upsert(&canvas_id, 50.0, 75.0, 0.5).unwrap();
        let fetched = repo.get_by_canvas(&canvas_id).unwrap().unwrap();

        assert_eq!(fetched.offset_x, 50.0);
        assert_eq!(fetched.offset_y, 75.0);
        assert_eq!(fetched.zoom, 0.5);
    }

    #[test]
    fn test_delete_canvas_cascades_view_state() {
        let db = setup_db();
        let (_, canvas_id) = create_test_canvas(&db);
        let conn = db.connection().unwrap();

        {
            let repo = db.canvas_view_states(&conn);
            repo.upsert(&canvas_id, 10.0, 20.0, 1.0).unwrap();
        }

        let canvases = db.visual_canvases(&conn);
        canvases.delete(&canvas_id).unwrap();

        let repo = db.canvas_view_states(&conn);
        let remaining = repo.get_by_canvas(&canvas_id).unwrap();
        assert!(remaining.is_none());
    }
}
