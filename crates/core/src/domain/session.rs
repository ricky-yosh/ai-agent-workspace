use serde::{Deserialize, Serialize};

use super::screen::Screen;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum SessionState {
    Running,
    Paused,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInstance {
    pub id: String,
    pub name: String,
    pub template_id: String,
    pub current_screen: Screen,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub working_directory: String,
    pub state: SessionState,
    pub active_workspace_id: Option<String>,
    pub workspaces: Vec<WorkspaceInstance>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub name: String,
    pub working_directory: String,
    pub state: SessionState,
    pub active_workspace_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub reachable: bool,
    pub project_type: String,
}
