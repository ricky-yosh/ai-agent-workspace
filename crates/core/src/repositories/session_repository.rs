use std::path::PathBuf;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{Session, SessionState, SessionSummary, WorkspaceInstance, LayoutTree};

fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn epoch_millis_to_iso(millis: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .unwrap_or_default();
    dt.to_rfc3339()
}

fn parse_state(s: &str) -> SessionState {
    match s {
        "Running" => SessionState::Running,
        "Paused" => SessionState::Paused,
        "Missing" => SessionState::Missing,
        _ => SessionState::Paused,
    }
}

fn state_to_string(s: &SessionState) -> &'static str {
    match s {
        SessionState::Running => "Running",
        SessionState::Paused => "Paused",
        SessionState::Missing => "Missing",
    }
}

pub struct SessionRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> SessionRepository<'a> {
    pub fn new(db_path: &PathBuf, conn: &'a Connection) -> Self {
        SessionRepository {
            _db_path: db_path.clone(),
            conn,
        }
    }

    pub fn create(&self, working_dir: &str, name: &str) -> Result<Session, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        self.conn.execute(
            "INSERT INTO sessions (id, name, working_directory, state, active_workspace_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)",
            params![id, name, working_dir, "Paused", now, now],
        )?;
        Ok(Session {
            id,
            name: name.to_string(),
            working_directory: working_dir.to_string(),
            state: SessionState::Paused,
            active_workspace_id: None,
            workspaces: vec![],
            created_at: epoch_millis_to_iso(now),
            updated_at: epoch_millis_to_iso(now),
        })
    }

    pub fn list(&self) -> Result<Vec<SessionSummary>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, working_directory, state, active_workspace_id, created_at, updated_at
             FROM sessions ORDER BY working_directory",
        )?;
        let rows = stmt.query_map([], |row| {
            let state_str: String = row.get(3)?;
            let working_dir: String = row.get(2)?;
            let path = std::path::Path::new(&working_dir);
            let reachable = path.exists();
            let project_type = detect_project_type(&working_dir);
            Ok(SessionSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                working_directory: row.get(2)?,
                state: parse_state(&state_str),
                active_workspace_id: row.get(4)?,
                created_at: epoch_millis_to_iso(row.get(5)?),
                updated_at: epoch_millis_to_iso(row.get(6)?),
                reachable,
                project_type,
            })
        })?;
        let mut summaries: Vec<SessionSummary> = rows.collect::<Result<Vec<_>, _>>()?;
        summaries.sort_by(|a, b| a.working_directory.cmp(&b.working_directory));
        Ok(summaries)
    }

    pub fn get(&self, id: &str) -> Result<Session, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, working_directory, state, active_workspace_id, created_at, updated_at
             FROM sessions WHERE id = ?1",
        )?;
        let session = stmt.query_row(params![id], |row| {
            let state_str: String = row.get(3)?;
            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                working_directory: row.get(2)?,
                state: parse_state(&state_str),
                active_workspace_id: row.get(4)?,
                workspaces: vec![],
                created_at: epoch_millis_to_iso(row.get(5)?),
                updated_at: epoch_millis_to_iso(row.get(6)?),
            })
        })?;

        let workspaces = self.get_workspaces(id)?;
        Ok(Session {
            workspaces,
            ..session
        })
    }

    pub fn rename(&self, id: &str, new_name: &str) -> Result<Session, rusqlite::Error> {
        let now = now_epoch_millis();
        let affected = self.conn.execute(
            "UPDATE sessions SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_name, now, id],
        )?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.get(id)
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        let affected = self.conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn delete_all(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM sessions", [])?;
        Ok(())
    }

    pub fn set_state(&self, id: &str, state: SessionState) -> Result<(), rusqlite::Error> {
        let now = now_epoch_millis();
        let affected = self.conn.execute(
            "UPDATE sessions SET state = ?1, updated_at = ?2 WHERE id = ?3",
            params![state_to_string(&state), now, id],
        )?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn set_active_workspace(&self, id: &str, workspace_id: &str) -> Result<(), rusqlite::Error> {
        let now = now_epoch_millis();
        let affected = self.conn.execute(
            "UPDATE sessions SET active_workspace_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![workspace_id, now, id],
        )?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn demote_running_to_paused(&self) -> Result<(), rusqlite::Error> {
        let now = now_epoch_millis();
        self.conn.execute(
            "UPDATE sessions SET state = 'Paused', updated_at = ?1 WHERE state = 'Running'",
            params![now],
        )?;
        Ok(())
    }

    fn get_workspaces(&self, session_id: &str) -> Result<Vec<WorkspaceInstance>, rusqlite::Error> {
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
}

fn detect_project_type(working_dir: &str) -> String {
    let path = std::path::Path::new(working_dir);
    if !path.exists() {
        return "generic".to_string();
    }
    let markers: &[(&[&str], &str)] = &[
        (&["Cargo.toml"], "rust"),
        (&["go.mod"], "go"),
        (&["pyproject.toml", "setup.py", "requirements.txt", "Pipfile", ".python-version"], "python"),
        (&["package.json"], "node"),
        (&["pom.xml", "build.gradle", "build.gradle.kts"], "java"),
        (&["Gemfile"], "ruby"),
        (&["composer.json"], "php"),
        (&["Package.swift"], "swift"),
        (&["CMakeLists.txt", "Makefile"], "c-cpp"),
    ];
    for (files, ptype) in markers {
        for file in *files {
            if path.join(file).exists() {
                return ptype.to_string();
            }
        }
    }
    if path.join(".git").exists() {
        return "git".to_string();
    }
    "generic".to_string()
}

#[cfg(test)]
mod tests {
    use crate::database::Database;
    use crate::domain::SessionState;

    fn setup_db() -> Database {
        Database::new(":memory:".into())
    }

    #[test]
    fn test_session_repository_creation() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let _repo = db.sessions(&conn);
    }

    #[test]
    fn test_create_session() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        let session = repo.create("/tmp/test", "Test Session").unwrap();
        assert_eq!(session.name, "Test Session");
        assert_eq!(session.working_directory, "/tmp/test");
        assert!(session.workspaces.is_empty());
    }

    #[test]
    fn test_list_sessions() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        repo.create("/tmp/a", "A").unwrap();
        repo.create("/tmp/b", "B").unwrap();
        let list = repo.list().unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_get_session() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        let created = repo.create("/tmp", "Test").unwrap();
        let got = repo.get(&created.id).unwrap();
        assert_eq!(got.id, created.id);
        assert_eq!(got.name, "Test");
    }

    #[test]
    fn test_get_session_not_found() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        let result = repo.get("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_rename_session() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        let created = repo.create("/tmp", "Old").unwrap();
        let renamed = repo.rename(&created.id, "New").unwrap();
        assert_eq!(renamed.name, "New");
    }

    #[test]
    fn test_delete_session() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        let created = repo.create("/tmp", "Test").unwrap();
        repo.delete(&created.id).unwrap();
        assert!(repo.get(&created.id).is_err());
    }

    #[test]
    fn test_delete_all_sessions() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        repo.create("/tmp", "A").unwrap();
        repo.create("/tmp", "B").unwrap();
        repo.delete_all().unwrap();
        assert!(repo.list().unwrap().is_empty());
    }

    #[test]
    fn test_set_state() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        let created = repo.create("/tmp", "Test").unwrap();
        repo.set_state(&created.id, SessionState::Running).unwrap();
        let got = repo.get(&created.id).unwrap();
        assert!(matches!(got.state, SessionState::Running));
    }

    #[test]
    fn test_demote_running_to_paused() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.sessions(&conn);
        let s1 = repo.create("/tmp", "A").unwrap();
        let s2 = repo.create("/tmp", "B").unwrap();
        repo.set_state(&s1.id, SessionState::Running).unwrap();
        repo.set_state(&s2.id, SessionState::Running).unwrap();
        repo.demote_running_to_paused().unwrap();
        assert!(matches!(repo.get(&s1.id).unwrap().state, SessionState::Paused));
        assert!(matches!(repo.get(&s2.id).unwrap().state, SessionState::Paused));
    }

    #[test]
    fn test_delete_session_cascades_to_workspaces() {
        let db = setup_db();
        let conn = db.connection().unwrap();

        let layout = {
            let repo = db.layouts(&conn);
            repo.create("General", crate::domain::LayoutTree::default_layout(), false).unwrap()
        };

        let session = {
            let repo = db.sessions(&conn);
            repo.create("/tmp", "Test").unwrap()
        };

        let ws = {
            let repo = db.workspaces(&conn);
            repo.create(&session.id, "General", &layout.id, crate::domain::LayoutTree::default_layout()).unwrap()
        };

        {
            let repo = db.sessions(&conn);
            let got = repo.get(&session.id).unwrap();
            assert_eq!(got.workspaces.len(), 1);
            assert_eq!(got.workspaces[0].id, ws.id);
        }

        {
            let repo = db.sessions(&conn);
            repo.delete(&session.id).unwrap();
        }

        {
            let repo = db.workspaces(&conn);
            let workspaces = repo.list_by_session(&session.id).unwrap();
            assert!(workspaces.is_empty());
        }
    }
}
