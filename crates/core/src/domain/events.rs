use super::Screen;

#[derive(Debug, Clone)]
pub enum DomainEvent {
    SessionsChanged,
    LayoutsChanged,
    WorkspaceChanged { session_id: String, screen: Screen },
}
