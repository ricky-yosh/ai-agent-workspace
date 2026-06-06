use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    Running,
    Paused,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub working_directory: String,
    pub state: SessionState,
    pub active_layout_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub name: String,
    pub working_directory: String,
    pub state: SessionState,
    pub active_layout_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub reachable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionsFile {
    sessions: Vec<Session>,
}

#[derive(Debug, Error)]
pub enum RegistryError {
    #[error("Session not found: {0}")]
    NotFound(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Data directory not available")]
    NoDataDir,
}

pub type Result<T> = std::result::Result<T, RegistryError>;

pub struct SessionRegistry {
    file_path: PathBuf,
    sessions: Vec<Session>,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl SessionRegistry {
    pub fn new() -> Result<Self> {
        let data_dir = dirs::data_dir().ok_or(RegistryError::NoDataDir)?;
        let file_path = data_dir.join("AI Workspace").join("sessions.json");
        Self::new_with_path(file_path)
    }

    fn new_with_path(file_path: PathBuf) -> Result<Self> {
        let sessions = if file_path.exists() {
            let content = fs::read_to_string(&file_path)?;
            if content.trim().is_empty() {
                Vec::new()
            } else {
                let sessions_file: SessionsFile = serde_json::from_str(&content)?;
                sessions_file.sessions
            }
        } else {
            Vec::new()
        };

        Ok(SessionRegistry { file_path, sessions })
    }

    pub fn create(&mut self, working_dir: &str, name: &str) -> Result<Session> {
        let now = now_iso();
        let session = Session {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            working_directory: working_dir.to_string(),
            state: SessionState::Paused,
            active_layout_id: None,
            created_at: now.clone(),
            updated_at: now,
        };
        self.sessions.push(session.clone());
        Ok(session)
    }

    pub fn list(&self) -> Result<Vec<SessionSummary>> {
        let mut summaries: Vec<SessionSummary> = self
            .sessions
            .iter()
            .map(|s| {
                let reachable = std::path::Path::new(&s.working_directory).exists();
                SessionSummary {
                    id: s.id.clone(),
                    name: s.name.clone(),
                    working_directory: s.working_directory.clone(),
                    state: s.state.clone(),
                    active_layout_id: s.active_layout_id.clone(),
                    created_at: s.created_at.clone(),
                    updated_at: s.updated_at.clone(),
                    reachable,
                }
            })
            .collect();
        summaries.sort_by(|a, b| a.working_directory.cmp(&b.working_directory));
        Ok(summaries)
    }

    fn find_index(&self, id: &str) -> Option<usize> {
        self.sessions.iter().position(|s| s.id == id)
    }

    pub fn rename(&mut self, id: &str, new_name: &str) -> Result<Session> {
        let idx = self
            .find_index(id)
            .ok_or_else(|| RegistryError::NotFound(id.to_string()))?;
        self.sessions[idx].name = new_name.to_string();
        self.sessions[idx].updated_at = now_iso();
        Ok(self.sessions[idx].clone())
    }

    pub fn delete(&mut self, id: &str) -> Result<()> {
        let idx = self
            .find_index(id)
            .ok_or_else(|| RegistryError::NotFound(id.to_string()))?;
        self.sessions.remove(idx);
        Ok(())
    }

    pub fn open(&mut self, id: &str) -> Result<Session> {
        let idx = self
            .find_index(id)
            .ok_or_else(|| RegistryError::NotFound(id.to_string()))?;
        self.sessions[idx].state = SessionState::Running;
        self.sessions[idx].updated_at = now_iso();
        Ok(self.sessions[idx].clone())
    }

    pub fn close(&mut self, id: &str) -> Result<Session> {
        let idx = self
            .find_index(id)
            .ok_or_else(|| RegistryError::NotFound(id.to_string()))?;
        self.sessions[idx].state = SessionState::Paused;
        self.sessions[idx].updated_at = now_iso();
        Ok(self.sessions[idx].clone())
    }

    pub fn set_active_layout_id(&mut self, id: &str, layout_id: Option<String>) -> Result<Session> {
        let idx = self
            .find_index(id)
            .ok_or_else(|| RegistryError::NotFound(id.to_string()))?;
        self.sessions[idx].active_layout_id = layout_id;
        self.sessions[idx].updated_at = now_iso();
        Ok(self.sessions[idx].clone())
    }

    pub fn get_by_id(&self, id: &str) -> Result<Session> {
        self.sessions
            .iter()
            .find(|s| s.id == id)
            .cloned()
            .ok_or_else(|| RegistryError::NotFound(id.to_string()))
    }

    pub fn demote_running_to_paused(&mut self) -> Result<()> {
        let now = now_iso();
        for session in self.sessions.iter_mut() {
            if matches!(session.state, SessionState::Running) {
                session.state = SessionState::Paused;
                session.updated_at = now.clone();
            }
        }
        Ok(())
    }

    pub fn save(&self) -> Result<()> {
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let sessions_file = SessionsFile {
            sessions: self.sessions.clone(),
        };
        let content = serde_json::to_string_pretty(&sessions_file)?;
        fs::write(&self.file_path, content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup() -> (SessionRegistry, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("sessions.json");
        let registry = SessionRegistry::new_with_path(file_path).unwrap();
        (registry, temp_dir)
    }

    #[test]
    fn test_create() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test Session").unwrap();
        assert_eq!(session.name, "Test Session");
        assert_eq!(session.working_directory, "/tmp");
        assert!(matches!(session.state, SessionState::Paused));
        assert!(session.active_layout_id.is_none());
        assert!(!session.id.is_empty());
        assert!(!session.created_at.is_empty());
        assert!(!session.updated_at.is_empty());
    }

    #[test]
    fn test_list() {
        let (mut registry, _tmp) = setup();
        registry.create("/tmp", "Session 1").unwrap();
        registry.create("/var", "Session 2").unwrap();
        let sessions = registry.list().unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn test_list_reachability() {
        let (mut registry, _tmp) = setup();
        registry.create("/nonexistent-path-xyz-123", "Ghost").unwrap();
        let sessions = registry.list().unwrap();
        assert!(!sessions[0].reachable);
    }

    #[test]
    fn test_rename() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Old Name").unwrap();
        let renamed = registry.rename(&session.id, "New Name").unwrap();
        assert_eq!(renamed.name, "New Name");
        let sessions = registry.list().unwrap();
        assert_eq!(sessions[0].name, "New Name");
    }

    #[test]
    fn test_delete() {
        let (mut registry, _tmp) = setup();
        let s1 = registry.create("/tmp", "A").unwrap();
        let s2 = registry.create("/tmp", "B").unwrap();
        registry.delete(&s1.id).unwrap();
        let sessions = registry.list().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, s2.id);
    }

    #[test]
    fn test_open() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let opened = registry.open(&session.id).unwrap();
        assert!(matches!(opened.state, SessionState::Running));
    }

    #[test]
    fn test_close() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        registry.open(&session.id).unwrap();
        let closed = registry.close(&session.id).unwrap();
        assert!(matches!(closed.state, SessionState::Paused));
    }

    #[test]
    fn test_demote_running_to_paused() {
        let (mut registry, _tmp) = setup();
        let s1 = registry.create("/tmp", "A").unwrap();
        let s2 = registry.create("/tmp", "B").unwrap();
        registry.open(&s1.id).unwrap();
        registry.open(&s2.id).unwrap();
        registry.demote_running_to_paused().unwrap();
        let sessions = registry.list().unwrap();
        for s in &sessions {
            assert!(matches!(s.state, SessionState::Paused));
        }
    }

    #[test]
    fn test_load_missing_file() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("sessions.json");
        let registry = SessionRegistry::new_with_path(file_path).unwrap();
        assert!(registry.list().unwrap().is_empty());
    }

    #[test]
    fn test_malformed_json() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("sessions.json");
        fs::write(&file_path, "not valid json").unwrap();
        let result = SessionRegistry::new_with_path(file_path);
        assert!(result.is_err());
    }
}
