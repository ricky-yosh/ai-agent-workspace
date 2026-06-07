use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub error: String,
    pub entity: String,
    pub id: String,
    pub message: String,
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", serde_json::to_string(self).unwrap_or_default())
    }
}

impl std::error::Error for CommandError {}

impl CommandError {
    pub fn not_found(entity: &str, id: &str) -> Self {
        Self {
            error: "not_found".to_string(),
            entity: entity.to_string(),
            id: id.to_string(),
            message: format!("{} not found: {}", entity, id),
        }
    }

    pub fn already_exists(entity: &str, id: &str) -> Self {
        Self {
            error: "already_exists".to_string(),
            entity: entity.to_string(),
            id: id.to_string(),
            message: format!("{} already exists: {}", entity, id),
        }
    }

    pub fn invalid_input(message: &str) -> Self {
        Self {
            error: "invalid_input".to_string(),
            entity: String::new(),
            id: String::new(),
            message: message.to_string(),
        }
    }

    pub fn internal(message: &str) -> Self {
        Self {
            error: "internal".to_string(),
            entity: String::new(),
            id: String::new(),
            message: message.to_string(),
        }
    }
}

impl From<ai_agent_workspace_core::RegistryError> for CommandError {
    fn from(err: ai_agent_workspace_core::RegistryError) -> Self {
        match err {
            ai_agent_workspace_core::RegistryError::NotFound(id) => {
                CommandError::not_found("session", &id)
            }
            ai_agent_workspace_core::RegistryError::Serialization(e) => {
                CommandError::internal(&format!("serialization failed: {}", e))
            }
            ai_agent_workspace_core::RegistryError::Io(e) => {
                CommandError::internal(&format!("io error: {}", e))
            }
            ai_agent_workspace_core::RegistryError::NoDataDir => {
                CommandError::internal("no data directory found")
            }
        }
    }
}

impl From<ai_agent_workspace_core::LayoutError> for CommandError {
    fn from(err: ai_agent_workspace_core::LayoutError) -> Self {
        match err {
            ai_agent_workspace_core::LayoutError::NotFound(id) => {
                CommandError::not_found("layout", &id)
            }
            ai_agent_workspace_core::LayoutError::Serialization(e) => {
                CommandError::internal(&format!("serialization failed: {}", e))
            }
            ai_agent_workspace_core::LayoutError::Io(e) => {
                CommandError::internal(&format!("io error: {}", e))
            }
            ai_agent_workspace_core::LayoutError::NoDataDir => {
                CommandError::internal("no data directory found")
            }
        }
    }
}
