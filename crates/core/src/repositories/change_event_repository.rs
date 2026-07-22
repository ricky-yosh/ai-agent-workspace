use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use chrono;

use crate::domain::ChangeEvent;

fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn epoch_millis_to_iso(millis: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .unwrap_or_default();
    dt.to_rfc3339()
}

pub struct ChangeEventRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> ChangeEventRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        ChangeEventRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn list_unprocessed(&self, session_id: &str) -> Result<Vec<ChangeEvent>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, entity_type, entity_id, event_type, payload_json, created_at, processed_at
             FROM change_events
             WHERE session_id = ?1 AND processed_at IS NULL
             ORDER BY created_at"
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let created: i64 = row.get(6)?;
            let processed: Option<i64> = row.get(7)?;
            Ok(ChangeEvent {
                id: row.get(0)?,
                session_id: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                event_type: row.get(4)?,
                payload_json: row.get(5)?,
                created_at: epoch_millis_to_iso(created),
                processed_at: processed.map(epoch_millis_to_iso),
            })
        })?;
        rows.collect()
    }

    pub fn mark_processed(&self, event_id: &str) -> Result<(), rusqlite::Error> {
        let now = now_epoch_millis();
        self.conn.execute(
            "UPDATE change_events SET processed_at = ?1 WHERE id = ?2",
            params![now, event_id],
        )?;
        Ok(())
    }
}
