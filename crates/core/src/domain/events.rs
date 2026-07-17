use serde::{Serialize, Deserialize};
use super::Screen;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DomainEvent {
    SessionsChanged,
    LayoutsChanged,
    WorkspaceChanged { session_id: String, workspace_id: String, screen: Screen },
    IssuesChanged { session_id: String },
    VisualCanvasesChanged { session_id: String },
    CanvasNodesChanged { session_id: String, canvas_id: String },
    CanvasEdgesChanged { session_id: String, canvas_id: String },
    CanvasGroupsChanged { session_id: String, canvas_id: String },
    CanvasTagsChanged { session_id: String, canvas_id: String },
    CanvasNodeSourcesChanged { session_id: String, canvas_id: String },
    C4DiagramsChanged { repo_path: String },
}
