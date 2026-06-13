use ai_agent_workspace_core::LayoutTree;

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
        tree: LayoutTree,
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
    WorkspaceUpdateTree {
        session_id: String,
        workspace_id: String,
        tree: LayoutTree,
    },
    WorkspaceReset {
        session_id: String,
        workspace_id: String,
    },
}
