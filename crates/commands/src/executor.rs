use crate::command::Command;
use crate::result::{CommandResult, ExecutionOutcome};
use crate::error::CommandError;
use crate::state::AppState;
use ai_agent_workspace_core::{DomainEvent, Screen};
use ai_agent_workspace_core::graph;

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
                let (template_id, template_name, default_screen) = match layouts_repo.find_by_name("General") {
                    Ok(general) => (general.id, general.name, general.screen),
                    Err(_) => {
                        let mut terminal_screen = Screen::new();
                        terminal_screen.areas[0].panel_type = "terminal".to_string();
                        let layout = layouts_repo.create("General", terminal_screen, true)?;
                        (layout.id, layout.name, layout.screen)
                    }
                };
                let workspaces_repo = state.db.workspaces(&conn);
                let ws = workspaces_repo.create(&session_id, &template_name, &template_id, default_screen)?;
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
        Command::TemplateSave { name, screen } => {
            let layouts = state.db.layouts(&conn);
            let layout = layouts.create(&name, screen, false)?;
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
            let ws = workspaces_repo.create(&session_id, &template.name, &template_id, template.screen.clone())?;

            let sessions_repo = state.db.sessions(&tx);
            let session = sessions_repo.get(&session_id)
                .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
            if session.workspaces.is_empty() || session.active_workspace_id.is_none() {
                sessions_repo.set_active_workspace(&session_id, &ws.id)?;
            }

            tx.commit()
                .map_err(|e| CommandError::internal(&e.to_string()))?;

            let screen = ws.current_screen.clone();
            let wid = ws.id.clone();
            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id, workspace_id: wid, screen }))
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

            let (emitted_workspace_id, screen) = {
                let s = sessions_repo.get(&session_id)
                    .map_err(|e| CommandError::not_found_from_sql("session", &session_id, e))?;
                match s.active_workspace_id {
                    Some(ref id) => {
                        let ws = workspaces_repo.get(id).ok();
                        (id.clone(), ws.map(|w| w.current_screen).unwrap_or_default())
                    }
                    None => (String::new(), Screen::default()),
                }
            };
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::WorkspaceChanged { session_id, workspace_id: emitted_workspace_id, screen }))
        }
        Command::WorkspaceRename { session_id, workspace_id, new_name } => {
            let workspaces_repo = state.db.workspaces(&conn);
            workspaces_repo.rename(&workspace_id, &new_name)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let screen = workspaces_repo.get(&workspace_id)
                .ok()
                .map(|ws| ws.current_screen)
                .unwrap_or_default();
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen }))
        }
        Command::WorkspaceSetActive { session_id, workspace_id } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let screen = ws.current_screen.clone();
            let sessions_repo = state.db.sessions(&conn);
            sessions_repo.set_active_workspace(&session_id, &workspace_id)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen }))
        }
        Command::WorkspaceUpdateScreen { session_id, workspace_id, screen } => {
            let workspaces_repo = state.db.workspaces(&conn);
            workspaces_repo.update_screen(&workspace_id, &screen)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen: screen.clone() }))
        }
        Command::WorkspaceReset { session_id, workspace_id } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let layouts_repo = state.db.layouts(&conn);
            let template = layouts_repo.get(&ws.template_id)?;
            workspaces_repo.update_screen(&workspace_id, &template.screen)?;
            let ws = workspaces_repo.get(&workspace_id)?;
            let screen = ws.current_screen.clone();
            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen }))
        }
        Command::SplitArea { session_id, workspace_id, area_id, axis, factor } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let mut screen = ws.current_screen.clone();
            graph::area_split(&mut screen, &area_id, axis, factor)
                .map_err(|e| CommandError::invalid_input(&e))?;
            graph::validate_screen(&screen)
                .map_err(|e| CommandError::internal(&format!("validation failed: {}", e)))?;
            workspaces_repo.update_screen(&workspace_id, &screen)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let ws = workspaces_repo.get(&workspace_id)?;
            let screen = ws.current_screen.clone();
            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen }))
        }
        Command::JoinAreas { session_id, workspace_id, source_area_id, target_area_id } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let mut screen = ws.current_screen.clone();
            graph::screen_area_join(&mut screen, &target_area_id, &source_area_id)
                .map_err(|e| CommandError::invalid_input(&e))?;
            graph::validate_screen(&screen)
                .map_err(|e| CommandError::internal(&format!("validation failed: {}", e)))?;
            workspaces_repo.update_screen(&workspace_id, &screen)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let ws = workspaces_repo.get(&workspace_id)?;
            let screen = ws.current_screen.clone();
            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen }))
        }
        Command::CloseArea { session_id, workspace_id, area_id } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let mut screen = ws.current_screen.clone();
            graph::screen_area_close(&mut screen, &area_id)
                .map_err(|e| CommandError::invalid_input(&e))?;
            graph::validate_screen(&screen)
                .map_err(|e| CommandError::internal(&format!("validation failed: {}", e)))?;
            workspaces_repo.update_screen(&workspace_id, &screen)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let ws = workspaces_repo.get(&workspace_id)?;
            let screen = ws.current_screen.clone();
            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen }))
        }
        Command::ResizeEdge { session_id, workspace_id, edge_id, position } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let mut screen = ws.current_screen.clone();
            graph::resize_edge(&mut screen, &edge_id, position)
                .map_err(|e| CommandError::invalid_input(&e))?;
            graph::validate_screen(&screen)
                .map_err(|e| CommandError::internal(&format!("validation failed: {}", e)))?;
            workspaces_repo.update_screen(&workspace_id, &screen)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let ws = workspaces_repo.get(&workspace_id)?;
            let screen = ws.current_screen.clone();
            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen }))
        }
        Command::ChangePanelType { session_id, workspace_id, area_id, panel_type } => {
            let workspaces_repo = state.db.workspaces(&conn);
            let ws = workspaces_repo.get(&workspace_id)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let mut screen = ws.current_screen.clone();
            graph::change_panel_type(&mut screen, &area_id, &panel_type)
                .map_err(|e| CommandError::invalid_input(&e))?;
            graph::validate_screen(&screen)
                .map_err(|e| CommandError::internal(&format!("validation failed: {}", e)))?;
            workspaces_repo.update_screen(&workspace_id, &screen)
                .map_err(|e| CommandError::not_found_from_sql("workspace", &workspace_id, e))?;
            let ws = workspaces_repo.get(&workspace_id)?;
            let screen = ws.current_screen.clone();
            Ok(ExecutionOutcome::with_event(CommandResult::Workspace(ws), DomainEvent::WorkspaceChanged { session_id, workspace_id, screen }))
        }
        Command::IssueCreate { session_id, title, body } => {
            let issues = state.db.issues(&conn);
            let issue = issues.create(&session_id, &title, &body)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Issue(issue), DomainEvent::IssuesChanged { session_id }))
        }
        Command::IssueList { session_id } => {
            let issues = state.db.issues(&conn);
            let list = issues.list_by_session(&session_id)?;
            Ok(ExecutionOutcome::none(CommandResult::Issues(list)))
        }
        Command::IssueGet { id, session_id } => {
            let issues = state.db.issues(&conn);
            let issue = match &session_id {
                Some(sid) => issues.resolve(&id, sid)
                    .map_err(|e| CommandError::not_found_from_sql("issue", &id, e))?,
                None => issues.get(&id)
                    .map_err(|e| CommandError::not_found_from_sql("issue", &id, e))?,
            };
            Ok(ExecutionOutcome::none(CommandResult::Issue(issue)))
        }
        Command::IssueUpdate { id, session_id, title, body, labels, state: new_state } => {
            let issues = state.db.issues(&conn);
            let existing = match &session_id {
                Some(sid) => issues.resolve(&id, sid)
                    .map_err(|e| CommandError::not_found_from_sql("issue", &id, e))?,
                None => issues.get(&id)
                    .map_err(|e| CommandError::not_found_from_sql("issue", &id, e))?,
            };
            let session_id_str = existing.session_id;
            let real_id = existing.id;
            let title_ref = title.as_deref();
            let body_ref = body.as_deref();
            let labels_ref = labels.as_deref();
            let state_ref = new_state.as_deref();
            let issue = issues.update(&real_id, title_ref, body_ref, labels_ref, state_ref)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Issue(issue), DomainEvent::IssuesChanged { session_id: session_id_str }))
        }
        Command::IssueClose { id, session_id } => {
            let issues = state.db.issues(&conn);
            let existing = match &session_id {
                Some(sid) => issues.resolve(&id, sid)
                    .map_err(|e| CommandError::not_found_from_sql("issue", &id, e))?,
                None => issues.get(&id)
                    .map_err(|e| CommandError::not_found_from_sql("issue", &id, e))?,
            };
            let session_id_str = existing.session_id;
            let real_id = existing.id;
            let issue = issues.close(&real_id)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Issue(issue), DomainEvent::IssuesChanged { session_id: session_id_str }))
        }
        Command::IssueDelete { id, session_id } => {
            let issues = state.db.issues(&conn);
            let existing = match &session_id {
                Some(sid) => issues.resolve(&id, sid)
                    .map_err(|e| CommandError::not_found_from_sql("issue", &id, e))?,
                None => issues.get(&id)
                    .map_err(|e| CommandError::not_found_from_sql("issue", &id, e))?,
            };
            let session_id_str = existing.session_id;
            let real_id = existing.id;
            issues.delete(&real_id)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::IssuesChanged { session_id: session_id_str }))
        }
        Command::IssueSearch { session_id, state: filter_state, label, keyword } => {
            let issues = state.db.issues(&conn);
            let list = issues.search(
                &session_id,
                filter_state.as_deref(),
                label.as_deref(),
                keyword.as_deref(),
            )?;
            Ok(ExecutionOutcome::none(CommandResult::Issues(list)))
        }
        Command::IssueGetNext { session_id } => {
            let issues = state.db.issues(&conn);
            match issues.get_next(&session_id)? {
                Some(issue) => Ok(ExecutionOutcome::none(CommandResult::Issue(issue))),
                None => Ok(ExecutionOutcome::none(CommandResult::Unit(()))),
            }
        }
        Command::IssueSummarizeBacklog { session_id } => {
            let issues = state.db.issues(&conn);
            let summary = issues.summarize(&session_id)?;
            Ok(ExecutionOutcome::none(CommandResult::IssueBacklogSummary(summary)))
        }
        Command::ChangeEventList { session_id } => {
            let events = state.db.change_events(&conn);
            let list = events.list_unprocessed(&session_id)?;
            Ok(ExecutionOutcome::none(CommandResult::ChangeEvents(list)))
        }
        Command::ChangeEventMarkProcessed { event_id } => {
            let events = state.db.change_events(&conn);
            events.mark_processed(&event_id)?;
            Ok(ExecutionOutcome::with_event(CommandResult::Unit(()), DomainEvent::IssuesChanged { session_id: String::new() }))
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
        let screen = ai_agent_workspace_core::Screen::default();

        let outcome = execute(
            Command::TemplateSave {
                name: "My Template".to_string(),
                screen,
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

        let screen = ai_agent_workspace_core::Screen::default();
        let outcome = execute(
            Command::TemplateSave {
                name: "General".to_string(),
                screen,
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
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: sid, workspace_id: wid, screen } => {
                assert_eq!(sid, &session.id);
                assert_eq!(wid, &ws.id, "Event workspace_id should match workspace id");
                assert_eq!(screen, &ws.current_screen, "Event screen should match workspace screen");
                assert_eq!(screen.areas.len(), 1, "Screen should have 1 area after add");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }
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
            Command::WorkspaceUpdateScreen {
                session_id: session.id.clone(),
                workspace_id: "nonexistent".to_string(),
                screen: ai_agent_workspace_core::Screen::default(),
            },
            &state,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_workspace_remove_last_workspace() {
        let (state, _tmp) = setup();

        // Create a session (this also creates a default workspace)
        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test".to_string(),
            },
            &state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };

        // Open to get the auto-created workspace
        let outcome = execute(
            Command::SessionOpen { session_id: session.id.clone() },
            &state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };
        let ws_id = session.workspaces[0].id.clone();

        // Remove the only workspace
        let outcome = execute(
            Command::WorkspaceRemove {
                session_id: session.id.clone(),
                workspace_id: ws_id.clone(),
            },
            &state,
        ).unwrap();

        // The event should carry a fresh default screen (1 blank area, 4 border edges)
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: sid, workspace_id: wid, screen } => {
                assert_eq!(sid, &session.id);
                assert_eq!(wid, &ws_id, "Event workspace_id should be the deleted workspace id (session still tracks it)");
                assert_eq!(screen.areas.len(), 1, "Screen should have 1 default area when no workspace remains");
                assert_eq!(screen.vertices.len(), 4, "Default screen has 4 vertices");
                assert_eq!(screen.edges.len(), 4, "Default screen has 4 edges");
                assert!(screen.edges.iter().all(|e| e.border), "All edges should be border edges");
                assert_eq!(screen.areas[0].panel_type, "blank", "Default area should be blank");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }

        // CommandResult should be Unit (not Workspace)
        assert!(matches!(outcome.result, CommandResult::Unit(())));
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
        let screen = ai_agent_workspace_core::Screen::default();
        let outcome = execute(
            Command::TemplateSave { name: "T1".into(), screen },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::LayoutsChanged]));
        let lid = match outcome.result { CommandResult::Layout(l) => l.id, _ => unreachable!() };

        let outcome = execute(
            Command::TemplateRename { layout_id: lid.clone(), new_name: "T2".into() },
            &state,
        ).unwrap();
        assert!(matches!(outcome.events.as_slice(), [DomainEvent::LayoutsChanged]));

        // Workspace mutating commands → WorkspaceChanged { session_id, workspace_id, screen }
        let outcome = execute(
            Command::WorkspaceAdd { session_id: sid.clone(), template_id: lid.clone() },
            &state,
        ).unwrap();
        let wid = match outcome.result { CommandResult::Workspace(w) => w.id, _ => unreachable!() };
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: s, workspace_id: w, screen } => {
                assert_eq!(s, &sid, "Session ID should match");
                assert_eq!(w, &wid, "Event workspace_id should match");
                assert_eq!(screen.areas.len(), 1, "Screen should have 1 area after add");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }

        let outcome = execute(
            Command::WorkspaceRename { session_id: sid.clone(), workspace_id: wid.clone(), new_name: "W2".into() },
            &state,
        ).unwrap();
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: s, workspace_id: w, screen } => {
                assert_eq!(s, &sid, "Session ID should match");
                assert_eq!(w, &wid, "Event workspace_id should match");
                assert_eq!(screen.areas.len(), 1, "Screen should have 1 area after rename");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }

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

    #[test]
    fn test_split_area_command() {
        let (state, _tmp) = setup();

        // Create session
        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test".to_string(),
            },
            &state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };

        // Open session to get default workspace
        let outcome = execute(
            Command::SessionOpen { session_id: session.id.clone() },
            &state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };
        let ws = &session.workspaces[0];
        let area_id = ws.current_screen.areas[0].id.clone();

        // Split the area vertically
        let outcome = execute(
            Command::SplitArea {
                session_id: session.id.clone(),
                workspace_id: ws.id.clone(),
                area_id: area_id.clone(),
                axis: ai_agent_workspace_core::Axis::Vertical,
                factor: 0.5,
            },
            &state,
        ).unwrap();
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: sid, workspace_id: wid, screen } => {
                assert_eq!(sid, &session.id);
                assert_eq!(wid, &ws.id, "Event workspace_id should match");
                assert_eq!(screen, &ws.current_screen, "Event screen should match workspace screen");
                assert_eq!(screen.areas.len(), 2, "Event screen should have 2 areas after split");
                assert_eq!(screen.vertices.len(), 6, "Event screen should have 6 vertices after split");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }
        assert_eq!(ws.current_screen.areas.len(), 2, "Should have 2 areas after split");
        assert_eq!(ws.current_screen.vertices.len(), 6, "Should have 6 vertices after split");
    }

    #[test]
    fn test_change_panel_type_command() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test".to_string(),
            },
            &state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };

        let outcome = execute(
            Command::SessionOpen { session_id: session.id.clone() },
            &state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };
        let ws = &session.workspaces[0];
        let area_id = ws.current_screen.areas[0].id.clone();

        // Change panel type to terminal
        let outcome = execute(
            Command::ChangePanelType {
                session_id: session.id.clone(),
                workspace_id: ws.id.clone(),
                area_id: area_id.clone(),
                panel_type: "terminal".to_string(),
            },
            &state,
        ).unwrap();
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(ws.current_screen.areas[0].panel_type, "terminal");
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: sid, workspace_id: wid, screen } => {
                assert_eq!(sid, &session.id);
                assert_eq!(wid, &ws.id, "Event workspace_id should match");
                assert_eq!(screen, &ws.current_screen, "Event screen should match workspace screen");
                assert_eq!(screen.areas[0].panel_type, "terminal", "Event screen should reflect updated panel type");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }
    }

    fn create_session_with_workspace(state: &AppState) -> (ai_agent_workspace_core::Session, ai_agent_workspace_core::WorkspaceInstance) {
        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test".to_string(),
            },
            state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };
        let outcome = execute(
            Command::SessionOpen { session_id: session.id.clone() },
            state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };
        let ws = session.workspaces[0].clone();
        (session, ws)
    }

    #[test]
    fn test_join_areas_command() {
        let (state, _tmp) = setup();
        let (session, ws) = create_session_with_workspace(&state);

        // Split first so we have 2 areas
        let area_id = ws.current_screen.areas[0].id.clone();
        let outcome = execute(
            Command::SplitArea {
                session_id: session.id.clone(),
                workspace_id: ws.id.clone(),
                area_id: area_id.clone(),
                axis: ai_agent_workspace_core::Axis::Vertical,
                factor: 0.5,
            },
            &state,
        ).unwrap();
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(ws.current_screen.areas.len(), 2);

        // Join the two areas back
        let source_id = ws.current_screen.areas[1].id.clone();
        let target_id = ws.current_screen.areas[0].id.clone();
        let outcome = execute(
            Command::JoinAreas {
                session_id: session.id.clone(),
                workspace_id: ws.id.clone(),
                source_area_id: source_id,
                target_area_id: target_id,
            },
            &state,
        ).unwrap();
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: sid, workspace_id: wid, screen } => {
                assert_eq!(sid, &session.id);
                assert_eq!(wid, &ws.id, "Event workspace_id should match");
                assert_eq!(screen, &ws.current_screen, "Event screen should match workspace screen");
                assert_eq!(screen.areas.len(), 1, "Event screen should have 1 area after join");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }
        assert_eq!(ws.current_screen.areas.len(), 1, "Should have 1 area after join");
    }

    #[test]
    fn test_close_area_command() {
        let (state, _tmp) = setup();
        let (session, ws) = create_session_with_workspace(&state);

        // Split first so we have 2 areas
        let area_id = ws.current_screen.areas[0].id.clone();
        let outcome = execute(
            Command::SplitArea {
                session_id: session.id.clone(),
                workspace_id: ws.id.clone(),
                area_id: area_id.clone(),
                axis: ai_agent_workspace_core::Axis::Horizontal,
                factor: 0.5,
            },
            &state,
        ).unwrap();
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(ws.current_screen.areas.len(), 2);

        // Close the second area
        let close_id = ws.current_screen.areas[1].id.clone();
        let outcome = execute(
            Command::CloseArea {
                session_id: session.id.clone(),
                workspace_id: ws.id.clone(),
                area_id: close_id,
            },
            &state,
        ).unwrap();
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: sid, workspace_id: wid, screen } => {
                assert_eq!(sid, &session.id);
                assert_eq!(wid, &ws.id, "Event workspace_id should match");
                assert_eq!(screen, &ws.current_screen, "Event screen should match workspace screen");
                assert_eq!(screen.areas.len(), 1, "Event screen should have 1 area after close");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }
        assert_eq!(ws.current_screen.areas.len(), 1, "Should have 1 area after close");
    }

    #[test]
    fn test_issue_create_and_list() {
        let (state, _tmp) = setup();

        // Create a session first
        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp/test".to_string(),
                name: "Test".to_string(),
            },
            &state,
        ).unwrap();
        let session = match outcome.result {
            CommandResult::Session(s) => s,
            _ => panic!("Expected Session"),
        };

        // Create an issue
        let outcome = execute(
            Command::IssueCreate {
                session_id: session.id.clone(),
                title: "Bug".to_string(),
                body: "Something broke".to_string(),
            },
            &state,
        ).unwrap();

        assert!(matches!(outcome.events.as_slice(), [DomainEvent::IssuesChanged { .. }]));
        if let DomainEvent::IssuesChanged { session_id: sid } = &outcome.events[0] {
            assert_eq!(sid, &session.id);
        }
        let issue = match outcome.result {
            CommandResult::Issue(i) => i,
            _ => panic!("Expected Issue"),
        };
        assert_eq!(issue.title, "Bug");
        assert_eq!(issue.body, "Something broke");
        assert_eq!(issue.session_id, session.id);
        assert_eq!(issue.number, 1);
        assert_eq!(issue.state, "open");
        assert_eq!(issue.author, "ai");

        // List issues
        let outcome = execute(
            Command::IssueList {
                session_id: session.id.clone(),
            },
            &state,
        ).unwrap();
        assert!(outcome.events.is_empty());
        let issues = match outcome.result {
            CommandResult::Issues(i) => i,
            _ => panic!("Expected Issues"),
        };
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, issue.id);
    }

    #[test]
    fn test_issue_create_emits_issues_changed() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp".into(),
                name: "S1".into(),
            },
            &state,
        ).unwrap();
        let sid = match outcome.result { CommandResult::Session(s) => s.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueCreate {
                session_id: sid.clone(),
                title: "Issue 1".to_string(),
                body: "".to_string(),
            },
            &state,
        ).unwrap();
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::IssuesChanged { session_id } => {
                assert_eq!(session_id, &sid);
            }
            _ => panic!("Expected IssuesChanged"),
        }
    }

    #[test]
    fn test_issue_get_emits_no_events() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp".into(),
                name: "S1".into(),
            },
            &state,
        ).unwrap();
        let sid = match outcome.result { CommandResult::Session(s) => s.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueCreate {
                session_id: sid.clone(),
                title: "Test".to_string(),
                body: "".to_string(),
            },
            &state,
        ).unwrap();
        let issue_id = match outcome.result { CommandResult::Issue(i) => i.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueGet { id: issue_id.clone(), session_id: None },
            &state,
        ).unwrap();
        assert!(outcome.events.is_empty());
        let issue = match outcome.result {
            CommandResult::Issue(i) => i,
            _ => panic!("Expected Issue"),
        };
        assert_eq!(issue.id, issue_id);
        assert_eq!(issue.title, "Test");
    }

    #[test]
    fn test_issue_get_not_found() {
        let (state, _tmp) = setup();
        let result = execute(
            Command::IssueGet { id: "nonexistent".to_string(), session_id: None },
            &state,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");
        assert_eq!(err.entity, "issue");
    }

    #[test]
    fn test_issue_update_emits_issues_changed() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp".into(),
                name: "S1".into(),
            },
            &state,
        ).unwrap();
        let sid = match outcome.result { CommandResult::Session(s) => s.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueCreate {
                session_id: sid.clone(),
                title: "Original".to_string(),
                body: "".to_string(),
            },
            &state,
        ).unwrap();
        let issue_id = match outcome.result { CommandResult::Issue(i) => i.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueUpdate {
                id: issue_id.clone(),
                session_id: None,
                title: Some("Updated".to_string()),
                body: None,
                labels: None,
                state: None,
            },
            &state,
        ).unwrap();
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::IssuesChanged { session_id } => {
                assert_eq!(session_id, &sid);
            }
            _ => panic!("Expected IssuesChanged"),
        }
        let issue = match outcome.result {
            CommandResult::Issue(i) => i,
            _ => panic!("Expected Issue"),
        };
        assert_eq!(issue.id, issue_id);
        assert_eq!(issue.title, "Updated");
    }

    #[test]
    fn test_issue_close_emits_issues_changed() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp".into(),
                name: "S1".into(),
            },
            &state,
        ).unwrap();
        let sid = match outcome.result { CommandResult::Session(s) => s.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueCreate {
                session_id: sid.clone(),
                title: "Test".to_string(),
                body: "".to_string(),
            },
            &state,
        ).unwrap();
        let issue_id = match outcome.result { CommandResult::Issue(i) => i.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueClose { id: issue_id.clone(), session_id: None },
            &state,
        ).unwrap();
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::IssuesChanged { session_id } => {
                assert_eq!(session_id, &sid);
            }
            _ => panic!("Expected IssuesChanged"),
        }
        let issue = match outcome.result {
            CommandResult::Issue(i) => i,
            _ => panic!("Expected Issue"),
        };
        assert_eq!(issue.id, issue_id);
        assert_eq!(issue.state, "closed");
    }

    #[test]
    fn test_issue_update_not_found() {
        let (state, _tmp) = setup();
        let result = execute(
            Command::IssueUpdate {
                id: "nonexistent".to_string(),
                session_id: None,
                title: Some("New".to_string()),
                body: None,
                labels: None,
                state: None,
            },
            &state,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");
    }

    #[test]
    fn test_issue_close_not_found() {
        let (state, _tmp) = setup();
        let result = execute(
            Command::IssueClose { id: "nonexistent".to_string(), session_id: None },
            &state,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");
    }

    #[test]
    fn test_issue_delete_emits_issues_changed() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp".into(),
                name: "S1".into(),
            },
            &state,
        ).unwrap();
        let sid = match outcome.result { CommandResult::Session(s) => s.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueCreate {
                session_id: sid.clone(),
                title: "To Delete".to_string(),
                body: "".to_string(),
            },
            &state,
        ).unwrap();
        let issue_id = match outcome.result { CommandResult::Issue(i) => i.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueDelete { id: issue_id.clone(), session_id: None },
            &state,
        ).unwrap();
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::IssuesChanged { session_id } => {
                assert_eq!(session_id, &sid);
            }
            _ => panic!("Expected IssuesChanged"),
        }
        assert!(matches!(outcome.result, CommandResult::Unit(())));
    }

    #[test]
    fn test_issue_delete_not_found() {
        let (state, _tmp) = setup();
        let result = execute(
            Command::IssueDelete { id: "nonexistent".to_string(), session_id: None },
            &state,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.error, "not_found");
        assert_eq!(err.entity, "issue");
    }

    #[test]
    fn test_issue_list_emits_no_events() {
        let (state, _tmp) = setup();

        let outcome = execute(
            Command::SessionCreate {
                working_dir: "/tmp".into(),
                name: "S1".into(),
            },
            &state,
        ).unwrap();
        let sid = match outcome.result { CommandResult::Session(s) => s.id, _ => unreachable!() };

        let outcome = execute(
            Command::IssueList { session_id: sid },
            &state,
        ).unwrap();
        assert!(outcome.events.is_empty());
    }

    #[test]
    fn test_resize_edge_command() {
        let (state, _tmp) = setup();
        let (session, ws) = create_session_with_workspace(&state);

        // Split first so we have an internal edge to resize
        let area_id = ws.current_screen.areas[0].id.clone();
        let outcome = execute(
            Command::SplitArea {
                session_id: session.id.clone(),
                workspace_id: ws.id.clone(),
                area_id: area_id.clone(),
                axis: ai_agent_workspace_core::Axis::Vertical,
                factor: 0.5,
            },
            &state,
        ).unwrap();
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };

        // Find the truly internal edge — not on any screen boundary (x=0, x=1, y=0, y=1)
        let internal_edge = ws.current_screen.edges.iter().find(|e| {
            if e.border { return false; }
            let v1 = ws.current_screen.get_vertex(&e.v1).unwrap();
            let v2 = ws.current_screen.get_vertex(&e.v2).unwrap();
            let on_x0 = v1.x.abs() < 0.01 && v2.x.abs() < 0.01;
            let on_x1 = (v1.x - 1.0).abs() < 0.01 && (v2.x - 1.0).abs() < 0.01;
            let on_y0 = v1.y.abs() < 0.01 && v2.y.abs() < 0.01;
            let on_y1 = (v1.y - 1.0).abs() < 0.01 && (v2.y - 1.0).abs() < 0.01;
            !(on_x0 || on_x1 || on_y0 || on_y1)
        }).expect("Should have an internal edge").clone();

        // Resize it to 0.7
        let outcome = execute(
            Command::ResizeEdge {
                session_id: session.id.clone(),
                workspace_id: ws.id.clone(),
                edge_id: internal_edge.id.clone(),
                position: 0.7,
            },
            &state,
        ).unwrap();
        let ws = match outcome.result {
            CommandResult::Workspace(w) => w,
            _ => panic!("Expected Workspace"),
        };
        assert_eq!(outcome.events.len(), 1);
        match &outcome.events[0] {
            DomainEvent::WorkspaceChanged { session_id: sid, workspace_id: wid, screen } => {
                assert_eq!(sid, &session.id);
                assert_eq!(wid, &ws.id, "Event workspace_id should match");
                assert_eq!(screen, &ws.current_screen, "Event screen should match workspace screen after resize");
            }
            _ => panic!("Expected WorkspaceChanged"),
        }

        // Verify the edge moved — find the edge again and check vertex positions
        let resized_edge = ws.current_screen.edges.iter().find(|e| e.id == internal_edge.id).unwrap();
        let v1 = ws.current_screen.get_vertex(&resized_edge.v1).unwrap();
        let v2 = ws.current_screen.get_vertex(&resized_edge.v2).unwrap();
        // Vertical split → the internal edge is vertical → x should be ~0.7
        assert!((v1.x - 0.7).abs() < 0.01, "Vertex x should be ~0.7, got {}", v1.x);
        assert!((v2.x - 0.7).abs() < 0.01, "Vertex x should be ~0.7, got {}", v2.x);
    }
}
