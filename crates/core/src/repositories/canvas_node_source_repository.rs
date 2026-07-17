use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::CanvasNodeSource;
use super::timestamps::{now_epoch_millis, epoch_millis_to_iso};

pub struct CanvasNodeSourceRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> CanvasNodeSourceRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        CanvasNodeSourceRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn create(&self, node_id: &str, url: &str, source_type: &str, sort_order: i32) -> Result<CanvasNodeSource, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        self.conn.execute(
            "INSERT INTO canvas_node_sources (id, node_id, url, source_type, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, node_id, url, source_type, sort_order, now],
        )?;
        Ok(CanvasNodeSource {
            id,
            node_id: node_id.to_string(),
            url: url.to_string(),
            source_type: source_type.to_string(),
            sort_order,
            created_at: epoch_millis_to_iso(now),
        })
    }

    pub fn get(&self, id: &str) -> Result<CanvasNodeSource, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, node_id, url, source_type, sort_order, created_at FROM canvas_node_sources WHERE id = ?1",
            params![id],
            |row| {
                let created: i64 = row.get(5)?;
                Ok(CanvasNodeSource {
                    id: row.get(0)?,
                    node_id: row.get(1)?,
                    url: row.get(2)?,
                    source_type: row.get(3)?,
                    sort_order: row.get(4)?,
                    created_at: epoch_millis_to_iso(created),
                })
            },
        )
    }

    pub fn list_by_node(&self, node_id: &str) -> Result<Vec<CanvasNodeSource>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, node_id, url, source_type, sort_order, created_at FROM canvas_node_sources WHERE node_id = ?1 ORDER BY sort_order ASC",
        )?;
        let rows = stmt.query_map(params![node_id], |row| {
            let created: i64 = row.get(5)?;
            Ok(CanvasNodeSource {
                id: row.get(0)?,
                node_id: row.get(1)?,
                url: row.get(2)?,
                source_type: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: epoch_millis_to_iso(created),
            })
        })?;
        rows.collect()
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM canvas_node_sources WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn delete_by_node(&self, node_id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM canvas_node_sources WHERE node_id = ?1",
            params![node_id],
        )?;
        Ok(())
    }
}
