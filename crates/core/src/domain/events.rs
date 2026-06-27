use super::Screen;

#[derive(Debug, Clone)]
pub enum DomainEvent {
    SessionsChanged,
    LayoutsChanged,
    WorkspaceChanged { session_id: String, workspace_id: String, screen: Screen },
    IssuesChanged { session_id: String },
}
