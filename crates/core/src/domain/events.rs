use super::Screen;

#[derive(Debug, Clone)]
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
    C4DiagramsChanged { repo_path: String },
}
