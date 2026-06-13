use crate::command::Command;
use crate::result::CommandResult;
use crate::error::CommandError;
use crate::state::AppState;

pub fn execute(command: Command, state: &AppState) -> Result<CommandResult, CommandError> {
    match command {
        Command::SessionCreate { working_dir, name } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let session = sessions.create(&working_dir, &name)?;
            sessions.save()?;
            Ok(CommandResult::Session(session))
        }
        Command::SessionList => {
            let sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let list = sessions.list()?;
            Ok(CommandResult::Sessions(list))
        }
        Command::SessionRename { session_id, new_name } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let session = sessions.rename(&session_id, &new_name)?;
            sessions.save()?;
            Ok(CommandResult::Session(session))
        }
        Command::SessionDelete { session_id } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            sessions.delete(&session_id)?;
            sessions.save()?;
            Ok(CommandResult::Unit(()))
        }
        Command::SessionOpen { session_id } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let session = sessions.open(&session_id)?;

            if session.workspaces.is_empty() {
                let mut store = state.layouts.lock()
                    .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
                let layouts = store.list_layouts()?;
                let (template_id, template_name, default_tree) = if let Some(general) = layouts.iter().find(|l| l.name == "General") {
                    (general.id.clone(), general.name.clone(), general.tree.clone())
                } else {
                    let terminal_tree = LayoutTree {
                        tree: LayoutNode::Panel {
                            panel_type: "terminal".into(),
                        },
                    };
                    let layout = store.save_layout("General", terminal_tree, true)?;
                    store.save()?;
                    (layout.id, layout.name, layout.tree)
                };
                drop(store);

                sessions.add_workspace(&session_id, &template_id, &template_name, default_tree)?;
                sessions.save()?;
            } else {
                sessions.save()?;
            }

            let result = sessions.get_by_id(&session_id)?;
            Ok(CommandResult::Session(result))
        }
        Command::SessionClose { session_id } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let session = sessions.close(&session_id)?;
            sessions.save()?;
            Ok(CommandResult::Session(session))
        }
        Command::TemplateList => {
            let store = state.layouts.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let layouts = store.list_layouts()?;
            Ok(CommandResult::Layouts(layouts))
        }
        Command::TemplateSave { name, tree } => {
            let mut store = state.layouts.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let layout = store.save_layout(&name, tree, false)?;
            store.save()?;
            Ok(CommandResult::Layout(layout))
        }
        Command::TemplateDelete { layout_id } => {
            let mut store = state.layouts.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            store.delete_layout(&layout_id)?;
            store.save()?;
            Ok(CommandResult::Unit(()))
        }
        Command::TemplateRename { layout_id, new_name } => {
            let mut store = state.layouts.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            store.rename_layout(&layout_id, &new_name)?;
            store.save()?;
            Ok(CommandResult::Unit(()))
        }
        Command::WorkspaceList { session_id } => {
            let sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let workspaces = sessions.get_workspaces(&session_id)?.clone();
            Ok(CommandResult::Workspaces(workspaces))
        }
        Command::WorkspaceGetActive { session_id } => {
            let sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            match sessions.get_active_workspace(&session_id) {
                Ok(ws) => Ok(CommandResult::Workspace(ws)),
                Err(_) => Ok(CommandResult::Unit(())),
            }
        }
        Command::WorkspaceAdd { session_id, template_id } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let store = state.layouts.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let template = store.get_layout(&template_id)?;
            drop(store);
            let ws = sessions.add_workspace(&session_id, &template_id, &template.name, template.tree)?;
            sessions.save()?;
            Ok(CommandResult::Workspace(ws))
        }
        Command::WorkspaceRemove { session_id, workspace_id } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            sessions.remove_workspace(&session_id, &workspace_id)?;
            sessions.save()?;
            Ok(CommandResult::Unit(()))
        }
        Command::WorkspaceRename { session_id, workspace_id, new_name } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            sessions.rename_workspace(&session_id, &workspace_id, &new_name)?;
            sessions.save()?;
            Ok(CommandResult::Unit(()))
        }
        Command::WorkspaceSetActive { session_id, workspace_id } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            sessions.set_active_workspace(&session_id, &workspace_id)?;
            sessions.save()?;
            Ok(CommandResult::Unit(()))
        }
        Command::WorkspaceUpdateTree { session_id, workspace_id, tree } => {
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            sessions.update_workspace_tree(&session_id, &workspace_id, tree)?;
            sessions.save()?;
            Ok(CommandResult::Unit(()))
        }
        Command::WorkspaceReset { session_id, workspace_id } => {
            let template_id = {
                let sessions = state.sessions.lock()
                    .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
                sessions.get_workspaces(&session_id)?
                    .iter().find(|w| w.id == workspace_id)
                    .ok_or_else(|| CommandError::not_found("workspace", &workspace_id))?
                    .template_id.clone()
            };
            let store = state.layouts.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            let default_tree = store.get_layout(&template_id)?.tree;
            drop(store);
            let mut sessions = state.sessions.lock()
                .map_err(|e| CommandError::internal(&format!("lock poisoned: {}", e)))?;
            sessions.reset_workspace_to_template(&session_id, &workspace_id, default_tree)?;
            sessions.save()?;
            let ws = sessions.get_workspaces(&session_id)?
                .iter().find(|w| w.id == workspace_id)
                .cloned()
                .ok_or_else(|| CommandError::not_found("workspace", &workspace_id))?;
            Ok(CommandResult::Workspace(ws))
        }
    }
}

use ai_agent_workspace_core::{LayoutNode, LayoutTree};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    fn setup() -> AppState {
        AppState::new().expect("Failed to create AppState")
    }

    #[test]
    fn test_session_create_and_list() {
        let state = setup();
        let result = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test Session".to_string(),
            },
            &state,
        ).unwrap();

        let session = match result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };
        assert_eq!(session.name, "Test Session");
        assert_eq!(session.working_directory, "/tmp/test");

        let result = execute(Command::SessionList, &state).unwrap();
        let sessions = match result {
            CommandResult::Sessions(s) => s,
            _ => panic!("Expected Sessions"),
        };
        assert!(!sessions.is_empty());
        assert!(sessions.iter().any(|s| s.id == session.id));
    }

    #[test]
    fn test_session_not_found() {
        let state = setup();

        let result = execute(
            Command::SessionRename {
                session_id: "nonexistent".to_string(),
                new_name: "New".to_string(),
            },
            &state,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");
        assert_eq!(err.entity, "session");

        let result = execute(
            Command::SessionDelete {
                session_id: "nonexistent".to_string(),
            },
            &state,
        );
        assert!(result.is_err());

        let result = execute(
            Command::SessionOpen {
                session_id: "nonexistent".to_string(),
            },
            &state,
        );
        assert!(result.is_err());

        let result = execute(
            Command::SessionClose {
                session_id: "nonexistent".to_string(),
            },
            &state,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_template_save_and_list() {
        let state = setup();
        let tree = ai_agent_workspace_core::LayoutStore::default_layout();

        let result = execute(
            Command::TemplateSave {
                name: "My Template".to_string(),
                tree,
            },
            &state,
        ).unwrap();

        let layout = match result {
            CommandResult::Layout(l) => l,
            _ => panic!("Expected Layout"),
        };
        assert_eq!(layout.name, "My Template");

        let result = execute(Command::TemplateList, &state).unwrap();
        let layouts = match result {
            CommandResult::Layouts(l) => l,
            _ => panic!("Expected Layouts"),
        };
        assert!(!layouts.is_empty());
        assert!(layouts.iter().any(|l| l.id == layout.id));
    }

    #[test]
    fn test_template_not_found() {
        let state = setup();

        let result = execute(
            Command::TemplateDelete {
                layout_id: "nonexistent".to_string(),
            },
            &state,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");
        assert_eq!(err.entity, "layout");

        let result = execute(
            Command::TemplateRename {
                layout_id: "nonexistent".to_string(),
                new_name: "New".to_string(),
            },
            &state,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_workspace_add_and_list() {
        let state = setup();

        let result = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test Session".to_string(),
            },
            &state,
        ).unwrap();
        let session = match result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };

        let tree = ai_agent_workspace_core::LayoutStore::default_layout();
        let result = execute(
            Command::TemplateSave {
                name: "General".to_string(),
                tree,
            },
            &state,
        ).unwrap();
        let layout = match result {
            CommandResult::Layout(l) => l,
            _ => panic!("Expected Layout"),
        };

        let result = execute(
            Command::WorkspaceAdd {
                session_id: session.id.clone(),
                template_id: layout.id.clone(),
            },
            &state,
        ).unwrap();
        let ws = match result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(ws.name, "General");
        assert_eq!(ws.template_id, layout.id);

        let result = execute(
            Command::WorkspaceList {
                session_id: session.id.clone(),
            },
            &state,
        ).unwrap();
        let workspaces = match result {
            CommandResult::Workspaces(w) => w,
            _ => panic!("Expected Workspaces"),
        };
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].id, ws.id);
    }

    #[test]
    fn test_workspace_not_found() {
        let state = setup();

        let result = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test Session".to_string(),
            },
            &state,
        ).unwrap();
        let session = match result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };

        let result = execute(
            Command::WorkspaceRemove {
                session_id: session.id.clone(),
                workspace_id: "nonexistent".to_string(),
            },
            &state,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");

        let result = execute(
            Command::WorkspaceRename {
                session_id: session.id.clone(),
                workspace_id: "nonexistent".to_string(),
                new_name: "New".to_string(),
            },
            &state,
        );
        assert!(result.is_err());

        let result = execute(
            Command::WorkspaceSetActive {
                session_id: session.id.clone(),
                workspace_id: "nonexistent".to_string(),
            },
            &state,
        );
        assert!(result.is_err());

        let result = execute(
            Command::WorkspaceUpdateTree {
                session_id: session.id.clone(),
                workspace_id: "nonexistent".to_string(),
                tree: ai_agent_workspace_core::LayoutStore::default_layout(),
            },
            &state,
        );
        assert!(result.is_err());
    }
}
