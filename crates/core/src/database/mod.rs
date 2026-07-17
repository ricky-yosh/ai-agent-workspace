pub mod migrations;
pub mod schema;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use thiserror::Error;

use crate::repositories::{SessionRepository, WorkspaceRepository, LayoutRepository, IssueRepository, ChangeEventRepository, VisualCanvasRepository, CanvasNodeRepository, CanvasEdgeRepository, CanvasGroupRepository, CanvasNodeSourceRepository, CanvasTagRepository, CanvasViewStateRepository, C4DiagramRepository};
use migrations::{migrate, MigrationError};

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("Migration error: {0}")]
    Migration(#[from] MigrationError),
    #[error("Database error: {0}")]
    Connection(#[from] rusqlite::Error),
}

pub type Result<T> = std::result::Result<T, DatabaseError>;

/// RAII wrapper that checks out a `Connection` from the `Database` cache.
/// When dropped, the connection is returned to the cache for reuse.
/// Implements `Deref<Target=Connection>` so callers use it transparently.
pub struct CachedConnection<'a> {
    cache: &'a Mutex<Option<Connection>>,
    conn: Option<Connection>,
}

impl<'a> std::ops::Deref for CachedConnection<'a> {
    type Target = Connection;
    fn deref(&self) -> &Connection {
        self.conn.as_ref().expect("connection already returned")
    }
}

impl<'a> std::ops::DerefMut for CachedConnection<'a> {
    fn deref_mut(&mut self) -> &mut Connection {
        self.conn.as_mut().expect("connection already returned")
    }
}

impl<'a> Drop for CachedConnection<'a> {
    fn drop(&mut self) {
        if let Some(conn) = self.conn.take() {
            let mut guard = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(conn);
        }
    }
}

pub struct Database {
    db_path: PathBuf,
    conn: Arc<Mutex<Option<Connection>>>,
}

impl Clone for Database {
    fn clone(&self) -> Self {
        Database {
            db_path: self.db_path.clone(),
            conn: Arc::clone(&self.conn),
        }
    }
}

impl Database {
    pub fn new(db_path: PathBuf) -> Self {
        Database {
            db_path,
            conn: Arc::new(Mutex::new(None)),
        }
    }

    /// Checks out a cached connection. On first call, opens the connection,
    /// sets PRAGMAs, and runs migrations. Subsequent calls reuse the same
    /// connection (checked back in when the returned guard is dropped).
    pub fn connection(&self) -> Result<CachedConnection<'_>> {
        let mut guard = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let conn = match guard.take() {
            Some(conn) => conn,
            None => Self::open_connection(&self.db_path)?,
        };
        Ok(CachedConnection {
            cache: &self.conn,
            conn: Some(conn),
        })
    }

    /// Opens a new connection, sets PRAGMAs, and runs migrations.
    fn open_connection(db_path: &std::path::Path) -> Result<Connection> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )?;
        migrate(&conn)?;
        Ok(conn)
    }

    /// Lightweight query: returns just the working directory for a session
    /// without loading workspaces or deserializing JSON.
    pub fn get_working_directory(&self, session_id: &str) -> Result<String> {
        let conn = self.connection()?;
        let working_dir: String = conn.query_row(
            "SELECT working_directory FROM sessions WHERE id = ?1",
            [session_id],
            |row| row.get(0),
        )?;
        Ok(working_dir)
    }

    pub fn sessions<'a>(&self, conn: &'a Connection) -> SessionRepository<'a> {
        SessionRepository::new(&self.db_path, conn)
    }

    pub fn workspaces<'a>(&self, conn: &'a Connection) -> WorkspaceRepository<'a> {
        WorkspaceRepository::new(&self.db_path, conn)
    }

    pub fn layouts<'a>(&self, conn: &'a Connection) -> LayoutRepository<'a> {
        LayoutRepository::new(&self.db_path, conn)
    }

    pub fn issues<'a>(&self, conn: &'a Connection) -> IssueRepository<'a> {
        IssueRepository::new(&self.db_path, conn)
    }

    pub fn change_events<'a>(&self, conn: &'a Connection) -> ChangeEventRepository<'a> {
        ChangeEventRepository::new(&self.db_path, conn)
    }

    pub fn visual_canvases<'a>(&self, conn: &'a Connection) -> VisualCanvasRepository<'a> {
        VisualCanvasRepository::new(&self.db_path, conn)
    }

    pub fn canvas_nodes<'a>(&self, conn: &'a Connection) -> CanvasNodeRepository<'a> {
        CanvasNodeRepository::new(&self.db_path, conn)
    }

    pub fn canvas_node_sources<'a>(&self, conn: &'a Connection) -> CanvasNodeSourceRepository<'a> {
        CanvasNodeSourceRepository::new(&self.db_path, conn)
    }

    pub fn canvas_edges<'a>(&self, conn: &'a Connection) -> CanvasEdgeRepository<'a> {
        CanvasEdgeRepository::new(&self.db_path, conn)
    }

    pub fn canvas_groups<'a>(&self, conn: &'a Connection) -> CanvasGroupRepository<'a> {
        CanvasGroupRepository::new(&self.db_path, conn)
    }

    pub fn canvas_tags<'a>(&self, conn: &'a Connection) -> CanvasTagRepository<'a> {
        CanvasTagRepository::new(&self.db_path, conn)
    }

    pub fn canvas_view_states<'a>(&self, conn: &'a Connection) -> CanvasViewStateRepository<'a> {
        CanvasViewStateRepository::new(&self.db_path, conn)
    }

    pub fn c4_diagrams<'a>(&self, conn: &'a Connection) -> C4DiagramRepository<'a> {
        C4DiagramRepository::new(&self.db_path, conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_database_connection_in_memory() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let version: i32 = conn
            .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, schema::SCHEMA_VERSION);
    }

    #[test]
    fn test_database_connection_sets_wal() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = Database::new(db_path);
        let conn = db.connection().unwrap();
        let journal_mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(journal_mode, "wal");
    }

    #[test]
    fn test_database_connection_sets_busy_timeout() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let busy_timeout: i32 = conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        assert_eq!(busy_timeout, 5000);
    }

    #[test]
    fn test_database_creates_file() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = Database::new(db_path.clone());
        let _conn = db.connection().unwrap();
        assert!(db_path.exists());
    }

    #[test]
    fn test_sessions_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.sessions(&conn);
    }

    #[test]
    fn test_workspaces_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.workspaces(&conn);
    }

    #[test]
    fn test_layouts_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.layouts(&conn);
    }

    #[test]
    fn test_canvas_nodes_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.canvas_nodes(&conn);
    }

    #[test]
    fn test_canvas_node_sources_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.canvas_node_sources(&conn);
    }

    #[test]
    fn test_canvas_edges_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.canvas_edges(&conn);
    }

    #[test]
    fn test_canvas_groups_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.canvas_groups(&conn);
    }

    #[test]
    fn test_canvas_tags_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.canvas_tags(&conn);
    }

    #[test]
    fn test_canvas_view_states_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.canvas_view_states(&conn);
    }

    #[test]
    fn test_c4_diagrams_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.c4_diagrams(&conn);
    }

    #[test]
    fn test_connection_caching() {
        let db = Database::new(":memory:".into());
        // First call initializes the connection
        {
            let conn = db.connection().unwrap();
            let version: i32 = conn
                .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
                .unwrap();
            assert_eq!(version, schema::SCHEMA_VERSION);
        } // conn dropped here, returned to cache

        // Second call reuses the cached connection (no PRAGMAs/migration)
        {
            let conn = db.connection().unwrap();
            let version: i32 = conn
                .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
                .unwrap();
            assert_eq!(version, schema::SCHEMA_VERSION);
        }
    }

    #[test]
    fn test_sequential_connections_same_data() {
        let db = Database::new(":memory:".into());
        // Create a session with first connection checkout
        let session_id = {
            let conn = db.connection().unwrap();
            let repo = db.sessions(&conn);
            let session = repo.create("/tmp/test", "Test").unwrap();
            session.id
        }; // conn returned to cache

        // Read the session with second connection checkout
        {
            let conn = db.connection().unwrap();
            let repo = db.sessions(&conn);
            let session = repo.get(&session_id).unwrap();
            assert_eq!(session.working_directory, "/tmp/test");
        }
    }

    #[test]
    fn test_shared_connection_across_clones() {
        let db1 = Database::new(":memory:".into());
        let db2 = db1.clone();
        // Both clones share the same underlying connection cache
        let _conn1 = db1.connection().unwrap();
        let _conn2 = db2.connection().unwrap();
    }

    #[test]
    fn test_get_working_directory() {
        let db = Database::new(":memory:".into());
        let session_id = {
            let conn = db.connection().unwrap();
            let repo = db.sessions(&conn);
            let session = repo.create("/tmp/test", "Test").unwrap();
            session.id
        }; // conn returned to cache

        let working_dir = db.get_working_directory(&session_id).unwrap();
        assert_eq!(working_dir, "/tmp/test");
    }

    #[test]
    fn test_get_working_directory_not_found() {
        let db = Database::new(":memory:".into());
        let result = db.get_working_directory("nonexistent");
        assert!(result.is_err());
    }
}
