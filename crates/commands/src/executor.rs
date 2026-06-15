use crate::command::Command;
use crate::result::{CommandResult, ExecutionOutcome};
use crate::error::CommandError;
use crate::state::AppState;
use ai_agent_workspace_core::{DomainEvent, LayoutNode, LayoutTree};

pub fn execute(command: Command, state: &AppState) -> Result<ExecutionOutcome, CommandError> {
    let mut conn = state.db.connection().map_err(|e| CommandError::internal(&e.to_string()))?;

    match command {
        Command::SessionCreate { working_dir, name } => {
            let sessions = state.db.sessions(&conn);
            let session = sessions.create(&working_dir, &name)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Session(session), DomainEvent::SessionsChanged))
        }
        Command::SessionList => {
            let sessions = state.db.sessions(&conn);
            let list = sessions.list()?;
            Ok(ExecutionOutcome::none(CommandResult::Sessions(list)))
        }
        Command::SessionRename { session_id, new_name } => {
            let sessions = state.db.sessions(&conn);
            let session = sessions.rename(&session_id, &new_name)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            Ok(ExecutionOutcome::with_event(CommandResult::Session(session), DomainEvent::SessionsChanged))
        }
        Command::SessionDelete { session_id } => {
            let sessions = state.db.sessions(&conn);
            sessions.delete(&session_id)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::SessionsChanged))
        }
        Command::SessionOpen { session_id } => {
            let sessions_repo = state.db.sessions(&conn);
            sessions_repo.set_state(&session_id, ai_agent_workspace_core::SessionState::Running)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            let session = sessions_repo.get(&session_id)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;

            if session.workspaces.is_empty() {
                let layouts_repo = state.db.layouts(&conn);
                let (template_id, template_name, default_tree) = match layouts_repo.find_by_name("General") {
                    Ok(general) => (general.id, general.name, general.tree),
                    Err(_) => {
                        let terminal_tree = LayoutTree {
                            tree: LayoutNode::Panel {
                                panel_type: "terminal".into(),
                                terminal_id: None,
                            },
                        };
                        let layout = layouts_repo.create("General", terminal_tree, true)?;
                        (layout.id, layout.name, layout.tree)
                    }
                };
                let workspaces_repo = state.db.workspaces(&conn);
                let ws = workspaces_repo.create(&session_id, &template_name, &template_id, default_tree)?;
                sessions_repo.set_active_workspace(&session_id, &ws.id)?;
            }

            let result = sessions_repo.get(&session_id)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            Ok(ExecutionOutcome::with_event(CommandResult::Session(result), DomainEvent::SessionsChanged))
        }
        Command::SessionClose { session_id } => {
            let sessions = state.db.sessions(&conn);
            sessions.set_state(&session_id, ai_agent_workspace_core::SessionState::Paused)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            let session = sessions.get(&session_id)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            Ok(ExecutionOutcome::with_event(CommandResult::Session(session), DomainEvent::SessionsChanged))
        }
        Command::SessionDeleteAll => {
            let sessions = state.db.sessions(&conn);
            sessions.delete_all()?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::SessionsChanged))
        }
        Command::TemplateList => {
            let layouts = state.db.layouts(&conn);
            let list = layouts.list()?;
            Ok(ExecutionOutcome::none(CommandResult::Layouts(list)))
        }
        Command::TemplateSave { name, tree } => {
            let layouts = state.db.layouts(&conn);
            let layout = layouts.create(&name, tree, false)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Layout(layout), DomainEvent::LayoutsChanged))
        }
        Command::TemplateDelete { layout_id } => {
            let layouts = state.db.layouts(&conn);
            match layouts.delete_non_builtin(&layout_id) {
                Ok(()) => Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::LayoutsChanged)),
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    Err(CommandError::not_found("layout", &layout_id))
                }
                Err(rusqlite::Error::InvalidParameterName(msg)) => {
                    Err(CommandError::invalid_input(&msg))
                }
                Err(e) => Err(CommandError::internal(&format!("database error: {}", e))),
            }
        }
        Command::TemplateRename { layout_id, new_name } => {
            let layouts = state.db.layouts(&conn);
            match layouts.rename_non_builtin(&layout_id, &new_name) {
                Ok(()) => Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::LayoutsChanged)),
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    Err(CommandError::not_found("layout", &layout_id))
                }
                Err(rusqlite::Error::InvalidParameterName(msg)) => {
                    Err(CommandError::invalid_input(&msg))
                }
                Err(e) => Err(CommandError::internal(&format!("database error: {}", e))),
            }
        }
        Command::TemplateDeleteAll => {
            let layouts = state.db.layouts(&conn);
            layouts.delete_all()?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::LayoutsChanged))
        }
        Command::WorkspaceList { session_id } => {
            let workspaces = state.db.workspaces(&conn);
            let list = workspaces.list_by_session(&session_id)?;
            Ok(ExecutionOutcome::none(CommandResult::Workspaces(list)))
        }
        Command::WorkspaceGetActive { session_id } => {
            let sessions_repo = state.db.sessions(&conn);
            let session = match sessions_repo.get(&session_id) {
                Ok(s) => s,
                Err(_) => return Ok(ExecutionOutcome::none(CommandResult::Unit(()))),
            };
            match session.active_workspace_id {
                Some(ws_id) => {
                    let workspaces = state.db.workspaces(&conn);
                    match workspaces.get(&ws_id) {
                        Ok(ws) => Ok(ExecutionOutcome::none(CommandResult::Workspace(ws))),
                        Err(_) => Ok(ExecutionOutcome::none(CommandResult::Unit(()))),
                    }
                }
                None => Ok(ExecutionOutcome::none(CommandResult::Unit(()))),
            }
        }
        Command::WorkspaceAdd { session_id, template_id } => {
            let tx = conn.transaction()
                .map_err(|e| CommandError::internal(&e.to_string()))?;

            let layouts_repo = state.db.layouts(&tx);
            let template = layouts_repo.get(&template_id)
                .map_err(|e| CommandError::not_found_from_sql("layout", &template_id, e))?;
            let workspaces_repo = state.db.workspaces(&tx);
            let ws = workspaces_repo.create(&session_id, &template.name, &template_id, template.tree.clone())?;

            let sessions_repo = state.db.sessions(&tx);
            let session = sessions_repo.get(&session_id)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            if session.workspaces.is_empty() || session.active_workspace_id.is_none() {
                sessions_repo.set_active_workspace(&session_id, &ws.id)?;
            }

            tx.commit()
                .map_err(|e| CommandError::internal(&e.to_string()))?;

            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id }))
        }
        Command::WorkspaceRemove { session_id, workspace_id } => {
            let workspaces_repo = state.db.workspaces(&conn);
            workspaces_repo.delete(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;

            let sessions_repo = state.db.sessions(&conn);
            let session = sessions_repo.get(&session_id)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            if session.active_workspace_id.as_deref() == Some(&workspace_id) {
                let remaining = workspaces_repo.list_by_session(&session_id)?;
                let new_active = remaining.first().map(|w| w.id.clone());
                if let Some(ref new_id) = new_active {
                    sessions_repo.set_active_workspace(&session_id, new_id)?;
                }
            }

            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::WorkspaceChanged { session_id }))
        }
        Command::WorkspaceRename { session_id, workspace_id, new_name } => {
            let workspaces_repo = state.db.workspaces(&conn);
            workspaces_repo.rename(&workspace_id, &new_name)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::WorkspaceChanged { session_id }))
        }
        Command::WorkspaceSetActive { session_id, workspace_id } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let _ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let sessions_repo = state.db.sessions(&conn);
            sessions_repo.set_active_workspace(&session_id, &workspace_id)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::WorkspaceChanged { session_id }))
        }
        Command::WorkspaceUpdateTree { session_id, workspace_id, tree } => {
            let workspaces_repo = state.db.workspaces(&conn);
            workspaces_repo.update_tree(&workspace_id, &tree)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::WorkspaceChanged { session_id }))
        }
        Command::WorkspaceReset { session_id, workspace_id } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let layouts_repo = state.db.layouts(&conn);
            let template = layouts_repo.get(&ws.template_id)?;
            workspaces_repo.update_tree(&workspace_id, &template.tree)?;
            let ws = workspaces_repo.get(&workspace_id)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;
    use tempfile::TempDir;

    fn setup() -> (AppState, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("workspace.db");
        let state = AppState::new(db_path);
        (state, temp_dir)
    }

    #[test]
    fn test_session_create_and_list() {
        let (state, _tmp) = setup();
        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test Session".to_string(),
            },
            &state,
        ).unwrap();

        assert!(matches!(outcome.events.as_slice(), [DomainEvent::SessionsChanged]));
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };
        assert_eq!(session.name, "Test Session");
        assert_eq!(session.working_directory, "/tmp/test");

        let outcome = execute(Command::SessionList, &state).unwrap();
        assert!(outcome.events.is_empty());
        let sessions = match outcome.result {
            CommandResult::Sessions(s) => s,
            _ => panic!("Expected Sessions"),
        };
        assert!(!sessions.is_empty());
        assert!(sessions.iter().any(|s| s.id == session.id));
    }

    #[test]
    fn test_session_not_found() {
        let (state, _tmp) = setup();

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
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");

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
        let (state, _tmp) = setup();
        let tree = ai_agent_workspace_core::LayoutTree::default_layout();

        let outcome = execute(
            Command::TemplateSave {
                name: "My Template".to_string(),
                tree,
            },
            &state,
        ).unwrap();

        assert!(matches!(outcome.events.as_slice(), [DomainEvent::LayoutsChanged]));
        let layout = match outcome.result {
            CommandResult::Layout(l) => l,
            _ => panic!("Expected Layout"),
        };
        assert_eq!(layout.name, "My Template");

        let outcome = execute(Command::TemplateList, &state).unwrap();
        assert!(outcome.events.is_empty());
        let layouts = match outcome.result {
            CommandResult::Layouts(l) => l,
            _ => panic!("Expected Layouts"),
        };
        assert!(!layouts.is_empty());
        assert!(layouts.iter().any(|l| l.id == layout.id));
    }

    #[test]
    fn test_template_not_found() {
        let (state, _tmp) = setup();

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
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");
    }

    #[test]
    fn test_workspace_add_and_list() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test Session".to_string(),
            },
            &state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };

        let tree = ai_agent_workspace_core::LayoutTree::default_layout();
        let outcome = execute(
            Command::TemplateSave {
                name: "General".to_string(),
                tree,
            },
            &state,
        ).unwrap();
        let layout = match outcome.result {
            CommandResult::Layout(l) => l,
            _ => panic!("Expected Layout"),
        };

        let outcome = execute(
            Command::WorkspaceAdd {
                session_id: session.id.clone(),
                template_id: layout.id.clone(),
            },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::WorkspaceChanged { .. }]));
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(ws.name, "General");
        assert_eq!(ws.template_id, layout.id);

        let outcome = execute(
            Command::WorkspaceList {
                session_id: session.id.clone(),
            },
            &state,
        ).unwrap();
        assert!(outcome.events.is_empty());
        let workspaces = match outcome.result {
            CommandResult::Workspaces(w) => w,
            _ => panic!("Expected Workspaces"),
        };
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].id, ws.id);
    }

    #[test]
    fn test_workspace_not_found() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test Session".to_string(),
            },
            &state,
        ).unwrap();
        let session = match outcome.result {
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
                tree: ai_agent_workspace_core::LayoutTree::default_layout(),
            },
            &state,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_event_assignment_per_command_category() {
        let (state, _tmp) = setup();

        // Session mutating commands → SessionsChanged
        let outcome = execute(
            Command::SessionCreate { working_dir: "/tmp".into(), name: "S1".into() },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::SessionsChanged]));
        let sid = match outcome.result { CommandResult::Session(s) => s.id, _ => unreachable!() };

        let outcome = execute(
            Command::SessionRename { session_id: sid.clone(), new_name: "S2".into() },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::SessionsChanged]));

        let outcome = execute(Command::SessionOpen { session_id: sid.clone() }, &state).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::SessionsChanged]));

        let outcome = execute(Command::SessionClose { session_id: sid.clone() }, &state).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::SessionsChanged]));

        // Template mutating commands → LayoutsChanged
        let tree = ai_agent_workspace_core::LayoutTree::default_layout();
        let outcome = execute(
            Command::TemplateSave { name: "T1".into(), tree },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::LayoutsChanged]));
        let lid = match outcome.result { CommandResult::Layout(l) => l.id, _ => unreachable!() };

        let outcome = execute(
            Command::TemplateRename { layout_id: lid.clone(), new_name: "T2".into() },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::LayoutsChanged]));

        // Workspace mutating commands → WorkspaceChanged { session_id }
        let outcome = execute(
            Command::WorkspaceAdd { session_id: sid.clone(), template_id: lid.clone() },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::WorkspaceChanged { session_id: ref s }] if s == &sid));
        let wid = match outcome.result { CommandResult::Workspace(w) => w.id, _ => unreachable!() };

        let outcome = execute(
            Command::WorkspaceRename { session_id: sid.clone(), workspace_id: wid.clone(), new_name: "W2".into() },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::WorkspaceChanged { session_id: ref s }] if s == &sid));

        // Read-only commands → empty events
        let outcome = execute(Command::SessionList, &state).unwrap();
        assert!(outcome.events.is_empty());

        let outcome = execute(Command::TemplateList, &state).unwrap();
        assert!(outcome.events.is_empty());

        let outcome = execute(Command::WorkspaceList { session_id: sid.clone() }, &state).unwrap();
        assert!(outcome.events.is_empty());

        let outcome = execute(Command::WorkspaceGetActive { session_id: sid.clone() }, &state).unwrap();
        assert!(outcome.events.is_empty());
    }
}
