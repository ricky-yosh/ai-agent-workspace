use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct C4Diagram {
    pub id: String,
    pub repo_path: String,
    pub name: String,
    pub diagram_json: String,
    pub created_at: String,
    pub updated_at: String,
}
