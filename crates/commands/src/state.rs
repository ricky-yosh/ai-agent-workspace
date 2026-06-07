use std::sync::Mutex;
use ai_agent_workspace_core::{SessionRegistry, LayoutStore};

pub struct AppState {
    pub sessions: Mutex<SessionRegistry>,
    pub layouts: Mutex<LayoutStore>,
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
            sessions: Mutex::new(sessions),
            layouts: Mutex::new(layouts),
        })
    }
}
