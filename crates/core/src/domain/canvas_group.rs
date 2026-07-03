use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasGroup {
    pub id: String,
    pub canvas_id: String,
    pub label: String,
    pub node_ids_json: String,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
