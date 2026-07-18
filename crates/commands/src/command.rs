use ai_agent_workspace_core::Screen;
use serde::Deserialize;

/// Spec for a node to create in a canvas_import batch.
#[derive(Debug, Deserialize)]
pub struct NodeImportSpec {
    pub r#ref: Option<String>,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    #[serde(default)]
    pub metadata_json: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

/// Spec for an edge to create in a canvas_import batch.
#[derive(Debug, Deserialize)]
pub struct EdgeImportSpec {
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub metadata_json: Option<String>,
}

/// Spec for a group to create in a canvas_import batch.
#[derive(Debug, Deserialize)]
pub struct GroupImportSpec {
    pub label: String,
    pub node_refs: Vec<String>,
    #[serde(default)]
    pub metadata_json: Option<String>,
}

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
        new_panel_type: Option<String>,
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
        labels: Option<Vec<String>>,
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
        title: String,
        description: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        metadata_json: Option<String>,
        tags: Option<Vec<String>>,
    },
    CanvasNodeList {
        canvas_id: String,
    },
    CanvasNodeGet {
        id: String,
    },
    CanvasNodeUpdate {
        id: String,
        title: Option<String>,
        description: Option<String>,
        x: Option<f64>,
        y: Option<f64>,
        width: Option<f64>,
        height: Option<f64>,
        metadata_json: Option<String>,
        tags: Option<Vec<String>>,
    },
    CanvasNodeDelete {
        id: String,
    },
    CanvasNodeSourceCreate {
        node_id: String,
        url: String,
        source_type: String,
        sort_order: i32,
    },
    CanvasNodeSourceList {
        node_id: String,
    },
    CanvasNodeSourceDelete {
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
    CanvasViewStateGet {
        canvas_id: String,
    },
    CanvasViewStateUpdate {
        canvas_id: String,
        offset_x: f64,
        offset_y: f64,
        zoom: f64,
    },
    CanvasImport {
        canvas_id: String,
        nodes_json: String,
        edges_json: Option<String>,
        groups_json: Option<String>,
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
