use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasViewState {
    pub id: String,
    pub canvas_id: String,
    pub offset_x: f64,
    pub offset_y: f64,
    pub zoom: f64,
    pub created_at: String,
    pub updated_at: String,
}
