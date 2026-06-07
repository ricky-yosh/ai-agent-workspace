use ai_agent_workspace_core::{Session, SessionSummary, Layout, WorkspaceInstance};

#[derive(Debug)]
pub enum CommandResult {
    Session(Session),
    Sessions(Vec<SessionSummary>),
    Layout(Layout),
    Layouts(Vec<Layout>),
    Workspace(WorkspaceInstance),
    Workspaces(Vec<WorkspaceInstance>),
    Unit(()),
}
