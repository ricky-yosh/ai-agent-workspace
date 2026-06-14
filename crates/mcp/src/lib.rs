pub mod error;
pub mod session_resolution;

use std::sync::{Arc, Mutex};
use rmcp::{ServerHandler, tool};
#[cfg(feature = "tauri-integration")]
use rmcp::serve_server;
use rmcp::model::{CallToolResult, Content, ServerInfo, ServerCapabilities};
use ai_agent_workspace_core::{SessionRegistry, LayoutStore, LayoutTree};
use ai_agent_workspace_commands::{AppState, Command, CommandResult, execute};
use serde_json;
#[cfg(feature = "tauri-integration")]
use tauri::{Emitter, Manager};

#[cfg(feature = "tauri-integration")]
fn make_change_callback(handle: &tauri::AppHandle, event: &'static str) -> Option<Arc<dyn Fn() + Send + Sync>> {
    let h = handle.clone();
    Some(Arc::new(move || { let _ = h.emit(event, ()); }) as Arc<dyn Fn() + Send + Sync>)
}

macro_rules! run_mcp_command {
    ($cmd:expr, $state:expr, $variant:ident, $bind:ident, json, callback: $cb:expr) => {
        match execute($cmd, $state) {
            Ok(CommandResult::$variant($bind)) => {
                if let Some(cb) = &$cb { cb(); }
                Ok(CallToolResult::success(vec![Content::json(&$bind)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:ident, json) => {
        match execute($cmd, $state) {
            Ok(CommandResult::$variant($bind)) => {
                Ok(CallToolResult::success(vec![Content::json(&$bind)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:pat, empty, callback: $cb:expr) => {
        match execute($cmd, $state) {
            Ok(CommandResult::$variant($bind)) => {
                if let Some(cb) = &$cb { cb(); }
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:pat, empty) => {
        match execute($cmd, $state) {
            Ok(CommandResult::$variant($bind)) => {
                Ok(CallToolResult::success(vec![]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
    ($cmd:expr, $state:expr, $variant:ident, $bind:ident, json_or_null) => {
        match execute($cmd, $state) {
            Ok(CommandResult::$variant($bind)) => {
                Ok(CallToolResult::success(vec![Content::json(&$bind)?]))
            }
            Ok(CommandResult::Unit(_)) => {
                Ok(CallToolResult::success(vec![Content::json(&serde_json::Value::Null)?]))
            }
            Ok(_) => Err(rmcp::Error::internal_error("unexpected result", None)),
            Err(e) => Err(crate::error::to_mcp_error(e)),
        }
    };
}

#[derive(Clone)]
pub struct McpHandler {
    pub sessions: Arc<Mutex<SessionRegistry>>,
    pub layouts: Arc<Mutex<LayoutStore>>,
    pub on_session_changed: Option<Arc<dyn Fn() + Send + Sync>>,
    pub on_layouts_changed: Option<Arc<dyn Fn() + Send + Sync>>,
    pub resolved_session_id: Option<String>,
    pub resolution_source: String,
}

impl ServerHandler for McpHandler {
    rmcp::tool_box!(@derive);

    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some("AI Agent Workspace MCP Server".into()),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

impl McpHandler {
    rmcp::tool_box!(McpHandler {
        current_session_info,
        session_list,
        session_create,
        session_rename,
        session_delete,
        session_open,
        session_close,
        template_list,
        template_save,
        template_delete,
        template_rename,
        workspace_list,
        workspace_get_active,
        workspace_add,
        workspace_remove,
        workspace_rename,
        workspace_set_active,
        workspace_update_tree,
        workspace_reset
    });

    #[tool(description = "List all sessions")]
    async fn session_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::SessionList, &state, Sessions, sessions, json)
    }

    #[tool(description = "Create a new session")]
    async fn session_create(&self, #[tool(param)] working_dir: String, #[tool(param)] name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::SessionCreate { working_dir, name }, &state, Session, session, json, callback: self.on_session_changed)
    }

    #[tool(description = "Rename a session")]
    async fn session_rename(&self, #[tool(param)] session_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::SessionRename { session_id, new_name }, &state, Session, session, json, callback: self.on_session_changed)
    }

    #[tool(description = "Delete a session")]
    async fn session_delete(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::SessionDelete { session_id }, &state, Unit, _, empty, callback: self.on_session_changed)
    }

    #[tool(description = "Open a session (set as active)")]
    async fn session_open(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::SessionOpen { session_id }, &state, Session, session, json)
    }

    #[tool(description = "Close the active session")]
    async fn session_close(&self, #[tool(param)] session_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::SessionClose { session_id }, &state, Session, session, json, callback: self.on_session_changed)
    }

    #[tool(description = "List all layout templates")]
    async fn template_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::TemplateList, &state, Layouts, layouts, json)
    }

    #[tool(description = "Save a layout template")]
    async fn template_save(&self, #[tool(param)] name: String, #[tool(param)] tree: LayoutTree) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::TemplateSave { name, tree }, &state, Layout, layout, json, callback: self.on_layouts_changed)
    }

    #[tool(description = "Delete a layout template")]
    async fn template_delete(&self, #[tool(param)] layout_id: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::TemplateDelete { layout_id }, &state, Unit, _, empty, callback: self.on_layouts_changed)
    }

    #[tool(description = "Rename a layout template")]
    async fn template_rename(&self, #[tool(param)] layout_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::TemplateRename { layout_id, new_name }, &state, Unit, _, empty, callback: self.on_layouts_changed)
    }

    fn require_session_id(&self) -> Result<String, rmcp::Error> {
        if let Some(ref id) = self.resolved_session_id {
            return Ok(id.clone());
        }
        if let Ok(id) = std::env::var("AIAW_SESSION_ID") {
            return Ok(id);
        }
        let cwd = std::env::current_dir()
            .map_err(|e| rmcp::Error::internal_error(format!("Cannot determine current directory: {}", e), None))?;
        let registry = self.sessions.lock()
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        crate::session_resolution::resolve_session_id(None, &cwd, &registry)
            .map_err(|e| rmcp::Error::invalid_params(format!("{}", e), None))
    }

    #[tool(description = "Show the current session info including ID, name, working directory, and how it was resolved")]
    async fn current_session_info(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let sessions = self.sessions.lock().map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let session = sessions.get_by_id(&session_id)
            .map_err(|e| rmcp::Error::internal_error(e.to_string(), None))?;
        let info = serde_json::json!({
            "session_id": session.id,
            "name": session.name,
            "working_directory": session.working_directory,
            "source": self.resolution_source,
        });
        Ok(CallToolResult::success(vec![Content::json(&info)?]))
    }

    #[tool(description = "List workspace instances for the current session")]
    async fn workspace_list(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::WorkspaceList { session_id }, &state, Workspaces, workspaces, json)
    }

    #[tool(description = "Get the active workspace instance, or null when none is active")]
    async fn workspace_get_active(&self) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::WorkspaceGetActive { session_id }, &state, Workspace, ws, json_or_null)
    }

    #[tool(description = "Add a workspace instance from a template")]
    async fn workspace_add(&self, #[tool(param)] template_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::WorkspaceAdd { session_id, template_id }, &state, Workspace, ws, json, callback: self.on_session_changed)
    }

    #[tool(description = "Remove a workspace instance")]
    async fn workspace_remove(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::WorkspaceRemove { session_id, workspace_id }, &state, Unit, _, empty, callback: self.on_session_changed)
    }

    #[tool(description = "Rename a workspace instance")]
    async fn workspace_rename(&self, #[tool(param)] workspace_id: String, #[tool(param)] new_name: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::WorkspaceRename { session_id, workspace_id, new_name }, &state, Unit, _, empty, callback: self.on_session_changed)
    }

    #[tool(description = "Set a workspace as the active workspace")]
    async fn workspace_set_active(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::WorkspaceSetActive { session_id, workspace_id }, &state, Unit, _, empty, callback: self.on_session_changed)
    }

    #[tool(description = "Update the layout tree of a workspace instance")]
    async fn workspace_update_tree(&self, #[tool(param)] workspace_id: String, #[tool(param)] tree: LayoutTree) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::WorkspaceUpdateTree { session_id, workspace_id, tree }, &state, Unit, _, empty, callback: self.on_session_changed)
    }

    #[tool(description = "Reset a workspace instance to the template layout")]
    async fn workspace_reset(&self, #[tool(param)] workspace_id: String) -> Result<CallToolResult, rmcp::Error> {
        let session_id = self.require_session_id()?;
        let state = AppState { sessions: self.sessions.clone(), layouts: self.layouts.clone() };
        run_mcp_command!(Command::WorkspaceReset { session_id, workspace_id }, &state, Workspace, ws, json, callback: self.on_session_changed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::RawContent;
    use tempfile::TempDir;

    fn setup() -> (McpHandler, TempDir) {
        let dir = TempDir::new().unwrap();
        let sessions_path = dir.path().join("sessions.json");
        let layouts_path = dir.path().join("layouts.json");
        let sessions = SessionRegistry::new_with_path(sessions_path).unwrap();
        let layouts = LayoutStore::new_with_path(layouts_path).unwrap();
        let handler = McpHandler {
            sessions: Arc::new(Mutex::new(sessions)),
            layouts: Arc::new(Mutex::new(layouts)),
            on_session_changed: None,
            on_layouts_changed: None,
            resolved_session_id: None,
            resolution_source: "env-var".to_string(),
        };
        (handler, dir)
    }

    fn extract_text(result: CallToolResult) -> String {
        result.content.first().and_then(|c| match &c.raw {
            RawContent::Text(t) => Some(t.text.clone()),
            _ => None,
        }).unwrap_or_default()
    }

    // --- Error mapping tests ---

    #[test]
    fn test_error_code_not_found() {
        let err = crate::error::to_mcp_error(
            ai_agent_workspace_commands::CommandError::not_found("session", "abc")
        );
        assert_eq!(err.code.0, -32001);
        assert!(err.data.is_some());
        let data = err.data.unwrap();
        assert_eq!(data["entity"], "session");
        assert_eq!(data["id"], "abc");
    }

    #[test]
    fn test_error_code_already_exists() {
        let err = crate::error::to_mcp_error(
            ai_agent_workspace_commands::CommandError::already_exists("template", "xyz")
        );
        assert_eq!(err.code.0, -32002);
    }

    #[test]
    fn test_error_code_invalid_input() {
        let err = crate::error::to_mcp_error(
            ai_agent_workspace_commands::CommandError::invalid_input("bad data")
        );
        assert_eq!(err.code.0, -32602);
    }

    #[test]
    fn test_error_code_internal() {
        let err = crate::error::to_mcp_error(
            ai_agent_workspace_commands::CommandError::internal("oops")
        );
        assert_eq!(err.code.0, -32000);
    }

    // --- Session tool tests ---

    #[tokio::test]
    async fn test_session_list_empty() {
        let (handler, _dir) = setup();
        let result = handler.session_list().await.unwrap();
        assert_eq!(result.content.len(), 1);
        let text = extract_text(result);
        assert_eq!(text, "[]");
    }

    #[tokio::test]
    async fn test_session_create_then_list() {
        let (handler, _dir) = setup();
        let result = handler.session_create("/tmp/test".into(), "Test Session".into()).await.unwrap();
        let text = extract_text(result);
        assert!(text.contains("Test Session"));
        assert!(text.contains("/tmp/test"));

        let list = handler.session_list().await.unwrap();
        let list_text = extract_text(list);
        assert!(list_text.contains("Test Session"));
    }

    #[tokio::test]
    async fn test_session_create_global() {
        let (handler, _dir) = setup();
        let result = handler.session_create("/tmp/global".into(), "Global".into()).await;
        assert!(result.is_ok());
        let text = extract_text(result.unwrap());
        assert!(text.contains("Global"));
    }

    #[tokio::test]
    async fn test_session_delete_not_found() {
        let (handler, _dir) = setup();
        let result = handler.session_delete("nonexistent".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code.0, -32001);
        let data = err.data.unwrap();
        assert_eq!(data["entity"], "session");
    }

    #[tokio::test]
    async fn test_session_rename_not_found() {
        let (handler, _dir) = setup();
        let result = handler.session_rename("nonexistent".into(), "New".into()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code.0, -32001);
    }

    // --- Template tool tests ---

    #[tokio::test]
    async fn test_template_list_empty() {
        let (handler, _dir) = setup();
        let result = handler.template_list().await.unwrap();
        let text = extract_text(result);
        assert_eq!(text, "[]");
    }

    #[tokio::test]
    async fn test_template_save_and_list() {
        let (handler, _dir) = setup();
        let tree = LayoutTree {
            tree: ai_agent_workspace_core::LayoutNode::Panel {
                panel_type: "terminal".into(),
            },
        };
        let result = handler.template_save("My Template".into(), tree).await.unwrap();
        let text = extract_text(result);
        assert!(text.contains("My Template"));

        let list = handler.template_list().await.unwrap();
        let list_text = extract_text(list);
        assert!(list_text.contains("My Template"));
    }

    #[tokio::test]
    async fn test_template_delete_not_found() {
        let (handler, _dir) = setup();
        let result = handler.template_delete("nonexistent".into()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code.0, -32001);
    }

    #[tokio::test]
    async fn test_template_rename_not_found() {
        let (handler, _dir) = setup();
        let result = handler.template_rename("nonexistent".into(), "New".into()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code.0, -32001);
    }

    // --- Workspace tool tests ---

    #[tokio::test]
    async fn test_workspace_requires_session_id() {
        let (mut handler, _dir) = setup();
        handler.resolved_session_id = None;
        std::env::remove_var("AIAW_SESSION_ID");
        let result = handler.workspace_list().await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code.0, -32602);
        assert!(err.message.contains("AIAW_SESSION_ID"));
    }

    #[tokio::test]
    async fn test_workspace_get_active_requires_session_id() {
        let (mut handler, _dir) = setup();
        handler.resolved_session_id = None;
        std::env::remove_var("AIAW_SESSION_ID");
        let result = handler.workspace_get_active().await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code.0, -32602);
    }

    #[tokio::test]
    async fn test_workspace_add_and_list_with_session() {
        let (mut handler, _dir) = setup();

        let create_result = handler.session_create("/tmp/ws_test".into(), "WS Test".into()).await.unwrap();
        let create_text = extract_text(create_result);

        let session: serde_json::Value = serde_json::from_str(&create_text).unwrap();
        let session_id = session["id"].as_str().unwrap().to_string();

        handler.resolved_session_id = Some(session_id);

        let tree = LayoutTree {
            tree: ai_agent_workspace_core::LayoutNode::Panel {
                panel_type: "terminal".into(),
            },
        };
        let tmpl_result = handler.template_save("WS Template".into(), tree).await.unwrap();
        let tmpl_text = extract_text(tmpl_result);
        let tmpl: serde_json::Value = serde_json::from_str(&tmpl_text).unwrap();
        let template_id = tmpl["id"].as_str().unwrap().to_string();

        let add_result = handler.workspace_add(template_id.clone()).await.unwrap();
        let add_text = extract_text(add_result);
        assert!(add_text.contains("WS Template"));

        let list_result = handler.workspace_list().await.unwrap();
        let list_text = extract_text(list_result);
        assert!(list_text.contains("WS Template"));

        let active_result = handler.workspace_get_active().await.unwrap();
        let active_text = extract_text(active_result);
        assert!(active_text.contains("WS Template"));
    }

    #[tokio::test]
    async fn test_cannot_delete_builtin_template() {
        let (handler, _dir) = setup();
        let tree = LayoutTree {
            tree: ai_agent_workspace_core::LayoutNode::Panel {
                panel_type: "blank".into(),
            },
        };
        let builtin = handler.layouts.lock().unwrap().save_layout("General", tree, true).unwrap();
        let result = handler.template_delete(builtin.id.clone()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code.0, -32602);
        assert!(err.message.contains("Built-in"));
    }

    #[tokio::test]
    async fn test_cannot_rename_builtin_template() {
        let (handler, _dir) = setup();
        let tree = LayoutTree {
            tree: ai_agent_workspace_core::LayoutNode::Panel {
                panel_type: "blank".into(),
            },
        };
        let builtin = handler.layouts.lock().unwrap().save_layout("General", tree, true).unwrap();
        let result = handler.template_rename(builtin.id.clone(), "Not General".into()).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code.0, -32602);
        assert!(err.message.contains("Built-in"));
    }

    #[tokio::test]
    async fn test_builtin_shows_in_list() {
        let (handler, _dir) = setup();
        let tree = LayoutTree {
            tree: ai_agent_workspace_core::LayoutNode::Panel {
                panel_type: "blank".into(),
            },
        };
        let _builtin = handler.layouts.lock().unwrap().save_layout("General", tree, true).unwrap();
        let result = handler.template_list().await.unwrap();
        let text = extract_text(result);
        assert!(text.contains("General"));
        assert!(text.contains("built_in"));
        assert!(text.contains("true"));
    }
}

#[cfg(feature = "tauri-integration")]
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("mcp")
        .setup(|app, _config| {
            let state = app.state::<AppState>();
            let sessions = state.sessions.clone();
            let layouts = state.layouts.clone();
            let handle = app.app_handle().clone();

            let on_session_changed = make_change_callback(&handle, "sessions-changed");
            let on_layouts_changed = make_change_callback(&handle, "layouts-changed");

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new()
                    .expect("failed to create tokio runtime for MCP server");
                rt.block_on(async {
                    let handler = McpHandler {
                        sessions,
                        layouts,
                        on_session_changed,
                        on_layouts_changed,
                        resolved_session_id: None,
                        resolution_source: "env-var".to_string(),
                    };
                    match serve_server(handler, rmcp::transport::io::stdio()).await {
                        Ok(running) => {
                            let _ = running.waiting().await;
                        }
                        Err(e) => {
                            eprintln!("[mcp] Server error: {}", e);
                        }
                    }
                });
            });

            Ok(())
        })
        .build()
}
