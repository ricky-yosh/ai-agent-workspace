use ai_agent_workspace_core::{Session, SessionSummary, Layout, WorkspaceInstance, Issue, IssueSummary, ChangeEvent, VisualCanvas, CanvasNode, CanvasEdge, CanvasGroup, CanvasNodeSource, CanvasTag, CanvasViewState, C4Diagram, DomainEvent};
use serde::Serialize;

#[derive(Debug)]
pub enum CommandResult {
    Session(Session),
    Sessions(Vec<SessionSummary>),
    Layout(Layout),
    Layouts(Vec<Layout>),
    Workspace(WorkspaceInstance),
    Workspaces(Vec<WorkspaceInstance>),
    Issue(Issue),
    Issues(Vec<Issue>),
    IssueBacklogSummary(IssueSummary),
    ChangeEvents(Vec<ChangeEvent>),
    VisualCanvas(VisualCanvas),
    VisualCanvases(Vec<VisualCanvas>),
    CanvasNode(CanvasNode),
    CanvasNodes(Vec<CanvasNode>),
    CanvasEdge(CanvasEdge),
    CanvasEdges(Vec<CanvasEdge>),
    CanvasGroup(CanvasGroup),
    CanvasGroups(Vec<CanvasGroup>),
    CanvasNodeSource(CanvasNodeSource),
    CanvasNodeSources(Vec<CanvasNodeSource>),
    CanvasTag(CanvasTag),
    CanvasTags(Vec<CanvasTag>),
    CanvasViewState(CanvasViewState),
    C4Diagram(C4Diagram),
    C4Diagrams(Vec<C4Diagram>),
    Unit(()),
}

impl Serialize for CommandResult {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            CommandResult::Session(v) => v.serialize(serializer),
            CommandResult::Sessions(v) => v.serialize(serializer),
            CommandResult::Layout(v) => v.serialize(serializer),
            CommandResult::Layouts(v) => v.serialize(serializer),
            CommandResult::Workspace(v) => v.serialize(serializer),
            CommandResult::Workspaces(v) => v.serialize(serializer),
            CommandResult::Issue(v) => v.serialize(serializer),
            CommandResult::Issues(v) => v.serialize(serializer),
            CommandResult::IssueBacklogSummary(v) => v.serialize(serializer),
            CommandResult::ChangeEvents(v) => v.serialize(serializer),
            CommandResult::VisualCanvas(v) => v.serialize(serializer),
            CommandResult::VisualCanvases(v) => v.serialize(serializer),
            CommandResult::CanvasNode(v) => v.serialize(serializer),
            CommandResult::CanvasNodes(v) => v.serialize(serializer),
            CommandResult::CanvasEdge(v) => v.serialize(serializer),
            CommandResult::CanvasEdges(v) => v.serialize(serializer),
            CommandResult::CanvasGroup(v) => v.serialize(serializer),
            CommandResult::CanvasGroups(v) => v.serialize(serializer),
            CommandResult::CanvasNodeSource(v) => v.serialize(serializer),
            CommandResult::CanvasNodeSources(v) => v.serialize(serializer),
            CommandResult::CanvasTag(v) => v.serialize(serializer),
            CommandResult::CanvasTags(v) => v.serialize(serializer),
            CommandResult::CanvasViewState(v) => v.serialize(serializer),
            CommandResult::C4Diagram(v) => v.serialize(serializer),
            CommandResult::C4Diagrams(v) => v.serialize(serializer),
            CommandResult::Unit(()) => serializer.serialize_none(),
        }
    }
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
