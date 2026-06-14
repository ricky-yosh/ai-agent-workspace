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

macro_rules! from_core_error {
    ($crate_name:ident :: $error_name:ident, $entity:literal) => {
        from_core_error!($crate_name::$error_name, $entity, );
    };
    ($crate_name:ident :: $error_name:ident, $entity:literal, $($extra_arms:tt)*) => {
        impl From<$crate_name::$error_name> for CommandError {
            fn from(err: $crate_name::$error_name) -> Self {
                match err {
                    $crate_name::$error_name::NotFound(id) => {
                        CommandError::not_found($entity, &id)
                    },
                    $($extra_arms)*
                    $crate_name::$error_name::Serialization(e) => {
                        CommandError::internal(&format!("serialization failed: {}", e))
                    },
                    $crate_name::$error_name::Io(e) => {
                        CommandError::internal(&format!("io error: {}", e))
                    },
                    $crate_name::$error_name::NoDataDir => {
                        CommandError::internal("no data directory found")
                    },
                }
            }
        }
    };
}

from_core_error!(ai_agent_workspace_core::RegistryError, "session");
from_core_error!(ai_agent_workspace_core::LayoutError, "layout",
    ai_agent_workspace_core::LayoutError::BuiltIn(name) => {
        CommandError::invalid_input(&format!("Built-in layout cannot be modified: {}", name))
    },
);
