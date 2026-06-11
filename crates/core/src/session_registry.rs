use std::path::PathBuf;
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use thiserror::Error;

use crate::layout_store::LayoutTree;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum SessionState {
    Running,
    Paused,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInstance {
    pub id: String,
    pub name: String,
    pub template_id: String,
    pub current_tree: LayoutTree,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub working_directory: String,
    pub state: SessionState,
    pub active_workspace_id: Option<String>,
    pub workspaces: Vec<WorkspaceInstance>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub name: String,
    pub working_directory: String,
    pub state: SessionState,
    pub active_workspace_id: Option<String>,
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
    suppress_watcher: AtomicBool,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

impl SessionRegistry {
    pub fn new() -> Result<Self> {
        let data_dir = dirs::data_dir().ok_or(RegistryError::NoDataDir)?;
        let file_path = data_dir.join("AI Agent Workspace").join("sessions.json");
        Self::new_with_path(file_path)
    }

    pub fn new_with_path(file_path: PathBuf) -> Result<Self> {
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

        Ok(SessionRegistry {
            file_path,
            sessions,
            suppress_watcher: AtomicBool::new(false),
        })
    }

    pub fn new_with_sessions(file_path: PathBuf, sessions: Vec<Session>) -> Self {
        SessionRegistry {
            file_path,
            sessions,
            suppress_watcher: AtomicBool::new(false),
        }
    }

    pub fn create(&mut self, working_dir: &str, name: &str) -> Result<Session> {
        let now = now_iso();
        let session = Session {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            working_directory: working_dir.to_string(),
            state: SessionState::Paused,
            active_workspace_id: None,
            workspaces: vec![],
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
                    active_workspace_id: s.active_workspace_id.clone(),
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

    pub fn add_workspace(&mut self, session_id: &str, template_id: &str, template_name: &str, default_tree: LayoutTree) -> Result<WorkspaceInstance> {
        let idx = self
            .find_index(session_id)
            .ok_or_else(|| RegistryError::NotFound(session_id.to_string()))?;
        let ws = WorkspaceInstance {
            id: Uuid::new_v4().to_string(),
            name: template_name.to_string(),
            template_id: template_id.to_string(),
            current_tree: default_tree,
        };
        let is_first = self.sessions[idx].workspaces.is_empty();
        self.sessions[idx].workspaces.push(ws.clone());
        if is_first {
            self.sessions[idx].active_workspace_id = Some(ws.id.clone());
        }
        self.sessions[idx].updated_at = now_iso();
        Ok(ws)
    }

    pub fn remove_workspace(&mut self, session_id: &str, workspace_id: &str) -> Result<()> {
        let idx = self
            .find_index(session_id)
            .ok_or_else(|| RegistryError::NotFound(session_id.to_string()))?;
        let session = &mut self.sessions[idx];
        let pos = session
            .workspaces
            .iter()
            .position(|w| w.id == workspace_id)
            .ok_or_else(|| RegistryError::NotFound(workspace_id.to_string()))?;
        session.workspaces.remove(pos);
        if session.active_workspace_id.as_deref() == Some(workspace_id) {
            session.active_workspace_id = session.workspaces.first().map(|w| w.id.clone());
        }
        session.updated_at = now_iso();
        Ok(())
    }

    pub fn rename_workspace(&mut self, session_id: &str, workspace_id: &str, new_name: &str) -> Result<()> {
        let idx = self
            .find_index(session_id)
            .ok_or_else(|| RegistryError::NotFound(session_id.to_string()))?;
        let ws = self.sessions[idx]
            .workspaces
            .iter_mut()
            .find(|w| w.id == workspace_id)
            .ok_or_else(|| RegistryError::NotFound(workspace_id.to_string()))?;
        ws.name = new_name.to_string();
        self.sessions[idx].updated_at = now_iso();
        Ok(())
    }

    pub fn set_active_workspace(&mut self, session_id: &str, workspace_id: &str) -> Result<()> {
        let idx = self
            .find_index(session_id)
            .ok_or_else(|| RegistryError::NotFound(session_id.to_string()))?;
        if !self.sessions[idx].workspaces.iter().any(|w| w.id == workspace_id) {
            return Err(RegistryError::NotFound(workspace_id.to_string()));
        }
        self.sessions[idx].active_workspace_id = Some(workspace_id.to_string());
        self.sessions[idx].updated_at = now_iso();
        Ok(())
    }

    pub fn update_workspace_tree(&mut self, session_id: &str, workspace_id: &str, tree: LayoutTree) -> Result<()> {
        let idx = self
            .find_index(session_id)
            .ok_or_else(|| RegistryError::NotFound(session_id.to_string()))?;
        let ws = self.sessions[idx]
            .workspaces
            .iter_mut()
            .find(|w| w.id == workspace_id)
            .ok_or_else(|| RegistryError::NotFound(workspace_id.to_string()))?;
        ws.current_tree = tree;
        self.sessions[idx].updated_at = now_iso();
        Ok(())
    }

    pub fn reset_workspace_to_template(&mut self, session_id: &str, workspace_id: &str, default_tree: LayoutTree) -> Result<()> {
        let idx = self
            .find_index(session_id)
            .ok_or_else(|| RegistryError::NotFound(session_id.to_string()))?;
        let ws = self.sessions[idx]
            .workspaces
            .iter_mut()
            .find(|w| w.id == workspace_id)
            .ok_or_else(|| RegistryError::NotFound(workspace_id.to_string()))?;
        ws.current_tree = default_tree;
        self.sessions[idx].updated_at = now_iso();
        Ok(())
    }

    pub fn get_workspaces(&self, session_id: &str) -> Result<&Vec<WorkspaceInstance>> {
        let idx = self
            .sessions
            .iter()
            .position(|s| s.id == session_id)
            .ok_or_else(|| RegistryError::NotFound(session_id.to_string()))?;
        Ok(&self.sessions[idx].workspaces)
    }

    pub fn get_active_workspace(&self, session_id: &str) -> Result<WorkspaceInstance> {
        let idx = self
            .sessions
            .iter()
            .position(|s| s.id == session_id)
            .ok_or_else(|| RegistryError::NotFound(session_id.to_string()))?;
        let ws_id = self.sessions[idx]
            .active_workspace_id
            .as_ref()
            .ok_or_else(|| RegistryError::NotFound("No active workspace".to_string()))?;
        self.sessions[idx]
            .workspaces
            .iter()
            .find(|w| w.id == *ws_id)
            .cloned()
            .ok_or_else(|| RegistryError::NotFound("Active workspace not found in workspaces list".to_string()))
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
        self.suppress_watcher.store(true, Ordering::SeqCst);
        let result = (|| {
            if let Some(parent) = self.file_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let sessions_file = SessionsFile {
                sessions: self.sessions.clone(),
            };
            let content = serde_json::to_string_pretty(&sessions_file)?;
            fs::write(&self.file_path, content)?;
            Ok::<(), RegistryError>(())
        })();
        self.suppress_watcher.store(false, Ordering::SeqCst);
        result
    }

    pub fn should_suppress_watcher(&self) -> bool {
        self.suppress_watcher.load(Ordering::SeqCst)
    }

    pub fn reload(&mut self) -> Result<()> {
        if self.file_path.exists() {
            let content = fs::read_to_string(&self.file_path)?;
            if content.trim().is_empty() {
                self.sessions = Vec::new();
            } else {
                let sessions_file: SessionsFile = serde_json::from_str(&content)?;
                self.sessions = sessions_file.sessions;
            }
        } else {
            self.sessions = Vec::new();
        }
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
        assert!(session.active_workspace_id.is_none());
        assert!(session.workspaces.is_empty());
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
    fn test_add_workspace() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let tree = crate::layout_store::LayoutStore::default_layout();
        let ws = registry
            .add_workspace(&session.id, "tmpl_general", "General", tree.clone())
            .unwrap();
        assert!(!ws.id.is_empty());
        assert_eq!(ws.template_id, "tmpl_general");
        assert_eq!(ws.current_tree, tree);

        let session = registry.get_by_id(&session.id).unwrap();
        assert_eq!(session.workspaces.len(), 1);
        assert_eq!(session.active_workspace_id, Some(ws.id.clone()));
    }

    #[test]
    fn test_remove_workspace() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let tree = crate::layout_store::LayoutStore::default_layout();
        let ws1 = registry
            .add_workspace(&session.id, "tmpl_a", "Template A", tree.clone())
            .unwrap();
        let ws2 = registry
            .add_workspace(&session.id, "tmpl_b", "Template B", tree.clone())
            .unwrap();

        registry.remove_workspace(&session.id, &ws1.id).unwrap();
        let session = registry.get_by_id(&session.id).unwrap();
        assert_eq!(session.workspaces.len(), 1);
        assert_eq!(session.active_workspace_id, Some(ws2.id.clone()));

        registry.remove_workspace(&session.id, &ws2.id).unwrap();
        let session = registry.get_by_id(&session.id).unwrap();
        assert!(session.workspaces.is_empty());
        assert!(session.active_workspace_id.is_none());
    }

    #[test]
    fn test_rename_workspace() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let tree = crate::layout_store::LayoutStore::default_layout();
        let ws = registry
            .add_workspace(&session.id, "tmpl_general", "General", tree)
            .unwrap();
        registry
            .rename_workspace(&session.id, &ws.id, "My Renamed Tab")
            .unwrap();
        let session = registry.get_by_id(&session.id).unwrap();
        assert_eq!(session.workspaces[0].name, "My Renamed Tab");
    }

    #[test]
    fn test_set_active_workspace() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let tree = crate::layout_store::LayoutStore::default_layout();
        let ws1 = registry
            .add_workspace(&session.id, "tmpl_a", "Template A", tree.clone())
            .unwrap();
        let ws2 = registry
            .add_workspace(&session.id, "tmpl_b", "Template B", tree)
            .unwrap();

        registry.set_active_workspace(&session.id, &ws2.id).unwrap();
        let session = registry.get_by_id(&session.id).unwrap();
        assert_eq!(session.active_workspace_id, Some(ws2.id));

        registry.set_active_workspace(&session.id, &ws1.id).unwrap();
        let session = registry.get_by_id(&session.id).unwrap();
        assert_eq!(session.active_workspace_id, Some(ws1.id));
    }

    #[test]
    fn test_update_workspace_tree() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let tree = crate::layout_store::LayoutStore::default_layout();
        let ws = registry
            .add_workspace(&session.id, "tmpl_general", "General", tree)
            .unwrap();

        let new_tree = crate::layout_store::LayoutTree {
            tree: crate::layout_store::LayoutNode::Panel {
                panel_type: "tasks".into(),
            },
        };
        registry
            .update_workspace_tree(&session.id, &ws.id, new_tree.clone())
            .unwrap();
        let session = registry.get_by_id(&session.id).unwrap();
        assert_eq!(session.workspaces[0].current_tree, new_tree);
    }

    #[test]
    fn test_get_workspaces() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let tree = crate::layout_store::LayoutStore::default_layout();
        registry
            .add_workspace(&session.id, "tmpl_a", "Template A", tree.clone())
            .unwrap();
        registry
            .add_workspace(&session.id, "tmpl_b", "Template B", tree)
            .unwrap();
        let workspaces = registry.get_workspaces(&session.id).unwrap();
        assert_eq!(workspaces.len(), 2);
    }

    #[test]
    fn test_get_active_workspace() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let tree = crate::layout_store::LayoutStore::default_layout();
        let ws = registry
            .add_workspace(&session.id, "tmpl_general", "General", tree)
            .unwrap();
        let active = registry.get_active_workspace(&session.id).unwrap();
        assert_eq!(active.id, ws.id);
    }

    #[test]
    fn test_get_active_workspace_none() {
        let (mut registry, _tmp) = setup();
        let session = registry.create("/tmp", "Test").unwrap();
        let result = registry.get_active_workspace(&session.id);
        assert!(result.is_err());
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
