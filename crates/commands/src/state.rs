use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use ai_agent_workspace_core::{SessionRegistry, LayoutStore};

pub struct AppState {
    pub sessions: Arc<Mutex<SessionRegistry>>,
    pub layouts: Arc<Mutex<LayoutStore>>,
}

impl AppState {
    pub fn new() -> ai_agent_workspace_core::session_registry::Result<Self> {
        let sessions = SessionRegistry::new()?;
        let layouts = LayoutStore::new().map_err(|e| {
            ai_agent_workspace_core::RegistryError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            ))
        })?;
        Ok(Self {
            sessions: Arc::new(Mutex::new(sessions)),
            layouts: Arc::new(Mutex::new(layouts)),
        })
    }

    pub fn new_with_paths(sessions_path: PathBuf, layouts_path: PathBuf) -> Self {
        let sessions = SessionRegistry::new_with_path(sessions_path)
            .expect("Failed to create SessionRegistry");
        let layouts = LayoutStore::new_with_path(layouts_path)
            .expect("Failed to create LayoutStore");
        Self {
            sessions: Arc::new(Mutex::new(sessions)),
            layouts: Arc::new(Mutex::new(layouts)),
        }
    }
}
