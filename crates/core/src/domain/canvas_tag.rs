use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasTag {
    pub id: String,
    pub node_id: String,
    pub tag: String,
    pub created_at: String,
}
