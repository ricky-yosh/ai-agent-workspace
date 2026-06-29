use ai_agent_workspace_core::Screen;

pub enum Command {
    SessionCreate {
        working_dir: String,
        name: String,
    },
    SessionList,
    SessionRename {
        session_id: String,
        new_name: String,
    },
    SessionDelete {
        session_id: String,
    },
    SessionOpen {
        session_id: String,
    },
    SessionClose {
        session_id: String,
    },
    SessionDeleteAll,
    TemplateList,
    TemplateSave {
        name: String,
        screen: Screen,
    },
    TemplateDelete {
        layout_id: String,
    },
    TemplateRename {
        layout_id: String,
        new_name: String,
    },
    TemplateDeleteAll,
    WorkspaceList {
        session_id: String,
    },
    WorkspaceGetActive {
        session_id: String,
    },
    WorkspaceAdd {
        session_id: String,
        template_id: String,
    },
    WorkspaceRemove {
        session_id: String,
        workspace_id: String,
    },
    WorkspaceRename {
        session_id: String,
        workspace_id: String,
        new_name: String,
    },
    WorkspaceSetActive {
        session_id: String,
        workspace_id: String,
    },
    WorkspaceUpdateScreen {
        session_id: String,
        workspace_id: String,
        screen: Screen,
    },
    WorkspaceReset {
        session_id: String,
        workspace_id: String,
    },
    SplitArea {
        session_id: String,
        workspace_id: String,
        area_id: String,
        axis: ai_agent_workspace_core::Axis,
        factor: f64,
    },
    JoinAreas {
        session_id: String,
        workspace_id: String,
        source_area_id: String,
        target_area_id: String,
    },
    CloseArea {
        session_id: String,
        workspace_id: String,
        area_id: String,
    },
    ResizeEdge {
        session_id: String,
        workspace_id: String,
        edge_id: String,
        position: f64,
    },
    ChangePanelType {
        session_id: String,
        workspace_id: String,
        area_id: String,
        panel_type: String,
    },
    IssueCreate {
        session_id: String,
        title: String,
        body: String,
    },
    IssueList {
        session_id: String,
    },
    IssueGet {
        id: String,
    },
    IssueUpdate {
        id: String,
        title: Option<String>,
        body: Option<String>,
        labels: Option<Vec<String>>,
        state: Option<String>,
    },
    IssueClose {
        id: String,
    },
    IssueDelete {
        id: String,
    },
    IssueSearch {
        session_id: String,
        state: Option<String>,
        label: Option<String>,
        keyword: Option<String>,
    },
    IssueGetNext {
        session_id: String,
    },
    IssueSummarizeBacklog {
        session_id: String,
    },
    ChangeEventList {
        session_id: String,
    },
    ChangeEventMarkProcessed {
        event_id: String,
    },
}
