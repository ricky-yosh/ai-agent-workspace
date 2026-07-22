use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeEvent {
    pub id: String,
    pub session_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub event_type: String,
    pub payload_json: String,
    pub created_at: String,
    pub processed_at: Option<String>,
}
