use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualCanvas {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}
