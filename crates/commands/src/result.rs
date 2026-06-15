use ai_agent_workspace_core::{Session, SessionSummary, Layout, WorkspaceInstance, DomainEvent};

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

#[derive(Debug)]
pub struct ExecutionOutcome {
    pub result: CommandResult,
    pub events: Vec<DomainEvent>,
}

impl ExecutionOutcome {
    pub fn new(result: CommandResult, events: Vec<DomainEvent>) -> Self {
        Self { result, events }
    }

    pub fn with_event(result: CommandResult, event: DomainEvent) -> Self {
        Self { result, events: vec![event] }
    }

    pub fn none(result: CommandResult) -> Self {
        Self { result, events: vec![] }
    }
}
