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
        session_id: Option<String>,
    },
    IssueUpdate {
        id: String,
        session_id: Option<String>,
        title: Option<String>,
        body: Option<String>,
        labels: Option<Vec<String>>,
        state: Option<String>,
    },
    IssueClose {
        id: String,
        session_id: Option<String>,
    },
    IssueDelete {
        id: String,
        session_id: Option<String>,
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
    VisualCanvasCreate {
        session_id: String,
        name: String,
    },
    VisualCanvasList {
        session_id: String,
    },
    VisualCanvasGet {
        id: String,
    },
    VisualCanvasDelete {
        id: String,
    },
    VisualCanvasRename {
        id: String,
        name: String,
    },
    CanvasNodeCreate {
        canvas_id: String,
        content: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        metadata_json: Option<String>,
    },
    CanvasNodeList {
        canvas_id: String,
    },
    CanvasNodeGet {
        id: String,
    },
    CanvasNodeUpdate {
        id: String,
        content: Option<String>,
        x: Option<f64>,
        y: Option<f64>,
        width: Option<f64>,
        height: Option<f64>,
        metadata_json: Option<String>,
    },
    CanvasNodeDelete {
        id: String,
    },
    CanvasEdgeCreate {
        canvas_id: String,
        source_node_id: String,
        target_node_id: String,
        label: Option<String>,
        metadata_json: Option<String>,
    },
    CanvasEdgeList {
        canvas_id: String,
    },
    CanvasEdgeGet {
        id: String,
    },
    CanvasEdgeUpdate {
        id: String,
        source_node_id: Option<String>,
        target_node_id: Option<String>,
        label: Option<String>,
        metadata_json: Option<String>,
    },
    CanvasEdgeDelete {
        id: String,
    },
    CanvasGroupCreate {
        canvas_id: String,
        label: String,
        node_ids_json: String,
        metadata_json: Option<String>,
    },
    CanvasGroupList {
        canvas_id: String,
    },
    CanvasGroupGet {
        id: String,
    },
    CanvasGroupUpdate {
        id: String,
        label: Option<String>,
        node_ids_json: Option<String>,
        metadata_json: Option<String>,
    },
    CanvasGroupDelete {
        id: String,
    },
    CanvasTagAdd {
        node_id: String,
        tag: String,
    },
    CanvasTagRemove {
        node_id: String,
        tag: String,
    },
    CanvasTagListByNode {
        node_id: String,
    },
    CanvasTagListByCanvas {
        canvas_id: String,
    },
    CanvasViewStateGet {
        canvas_id: String,
    },
    CanvasViewStateUpdate {
        canvas_id: String,
        offset_x: f64,
        offset_y: f64,
        zoom: f64,
    },
    C4DiagramCreate {
        repo_path: String,
        name: String,
        diagram_json: String,
    },
    C4DiagramList {
        repo_path: String,
    },
    C4DiagramGet {
        id: String,
    },
    C4DiagramDelete {
        id: String,
    },
    C4DiagramRename {
        id: String,
        name: String,
    },
}
