use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasNodeSource {
    pub id: String,
    pub node_id: String,
    pub url: String,
    pub source_type: String,
    pub sort_order: i32,
    pub created_at: String,
}
