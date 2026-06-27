pub mod migrations;
pub mod schema;

use std::path::PathBuf;
use rusqlite::Connection;
use thiserror::Error;

use crate::repositories::{SessionRepository, WorkspaceRepository, LayoutRepository, IssueRepository};
use migrations::{migrate, MigrationError};

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("Migration error: {0}")]
    Migration(#[from] MigrationError),
    #[error("Database error: {0}")]
    Connection(#[from] rusqlite::Error),
}

pub type Result<T> = std::result::Result<T, DatabaseError>;

#[derive(Clone)]
pub struct Database {
    db_path: PathBuf,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Self {
        Database { db_path }
    }

    pub fn connection(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )?;
        migrate(&conn)?;
        Ok(conn)
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
    fn test_issues_repository_stub() {
        let db = Database::new(":memory:".into());
        let conn = db.connection().unwrap();
        let _repo = db.issues(&conn);
    }
}
