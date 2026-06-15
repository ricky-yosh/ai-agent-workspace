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

    pub fn not_found_from_sql(entity: &str, id: &str, err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::QueryReturnedNoRows => CommandError::not_found(entity, id),
            _ => CommandError::internal(&format!("database error: {}", err)),
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

impl From<rusqlite::Error> for CommandError {
    fn from(err: rusqlite::Error) -> Self {
        match err {
            rusqlite::Error::QueryReturnedNoRows => {
                CommandError::not_found("entity", "unknown")
            }
            rusqlite::Error::InvalidParameterName(ref msg) => {
                if msg.to_lowercase().contains("built-in") {
                    CommandError::invalid_input(msg)
                } else {
                    CommandError::internal(&format!("database error: {}", err))
                }
            }
            _ => CommandError::internal(&format!("database error: {}", err)),
        }
    }
}
