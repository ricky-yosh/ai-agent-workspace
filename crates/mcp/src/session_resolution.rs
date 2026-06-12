use std::path::{Path, PathBuf};
use ai_agent_workspace_core::SessionRegistry;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionResolutionError {
    NoMatch {
        searched_cwd: PathBuf,
    },
    MultipleMatches {
        candidates: Vec<(String, String)>,
    },
}

impl std::fmt::Display for SessionResolutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SessionResolutionError::NoMatch { searched_cwd } => {
                write!(
                    f,
                    "No session found for directory '{}'. Create a session in the AI Agent Workspace app or set AIAW_SESSION_ID.",
                    searched_cwd.display()
                )
            }
            SessionResolutionError::MultipleMatches { candidates } => {
                let listing: Vec<String> = candidates
                    .iter()
                    .map(|(id, name)| format!("  {} ({})", name, id))
                    .collect();
                write!(
                    f,
                    "Multiple sessions match this directory:\n{}\nSet AIAW_SESSION_ID to disambiguate.",
                    listing.join("\n")
                )
            }
        }
    }
}

pub fn resolve_session_id(
    env_session_id: Option<&str>,
    cwd: &Path,
    registry: &SessionRegistry,
) -> Result<String, SessionResolutionError> {
    if let Some(id) = env_session_id {
        return Ok(id.to_string());
    }

    let canonical_cwd = std::fs::canonicalize(cwd)
        .map_err(|_| SessionResolutionError::NoMatch {
            searched_cwd: cwd.to_path_buf(),
        })?;

    let sessions = registry.list().unwrap_or_default();

    let mut matches: Vec<(String, String)> = Vec::new();

    for session in &sessions {
        let session_path = Path::new(&session.working_directory);
        if let Ok(canonical_session) = std::fs::canonicalize(session_path) {
            if canonical_session == canonical_cwd {
                matches.push((session.id.clone(), session.name.clone()));
            }
        }
    }

    match matches.len() {
        0 => Err(SessionResolutionError::NoMatch {
            searched_cwd: cwd.to_path_buf(),
        }),
        1 => Ok(matches.remove(0).0),
        _ => Err(SessionResolutionError::MultipleMatches { candidates: matches }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ai_agent_workspace_core::{Session, SessionState};
    use std::path::PathBuf;

    fn make_session(id: &str, name: &str, working_directory: &str) -> Session {
        Session {
            id: id.to_string(),
            name: name.to_string(),
            working_directory: working_directory.to_string(),
            state: SessionState::Paused,
            active_workspace_id: None,
            workspaces: Vec::new(),
            created_at: "2025-01-01T00:00:00+00:00".to_string(),
            updated_at: "2025-01-01T00:00:00+00:00".to_string(),
        }
    }

    fn make_registry(sessions: Vec<Session>) -> SessionRegistry {
        SessionRegistry::new_with_sessions(PathBuf::from("/dev/null"), sessions)
    }

    #[test]
    fn env_var_set_returns_immediately() {
        let registry = make_registry(vec![]);
        let cwd = std::env::temp_dir();

        let result = resolve_session_id(Some("my-session"), &cwd, &registry);
        assert_eq!(result.unwrap(), "my-session");
    }

    #[test]
    fn env_var_set_ignores_registry() {
        let sessions = vec![make_session("s1", "Session 1", "/nonexistent")];
        let registry = make_registry(sessions);
        let cwd = std::env::temp_dir();

        let result = resolve_session_id(Some("override"), &cwd, &registry);
        assert_eq!(result.unwrap(), "override");
    }

    #[test]
    fn single_match_returns_session_id() {
        let temp = std::env::temp_dir();
        let sessions = vec![
            make_session("s1", "Session 1", temp.to_str().unwrap()),
            make_session("s2", "Session 2", "/nonexistent/path"),
        ];
        let registry = make_registry(sessions);

        let result = resolve_session_id(None, &temp, &registry);
        assert_eq!(result.unwrap(), "s1");
    }

    #[test]
    fn no_match_returns_error() {
        let sessions = vec![
            make_session("s1", "Session 1", "/nonexistent/path/a"),
            make_session("s2", "Session 2", "/nonexistent/path/b"),
        ];
        let registry = make_registry(sessions);
        let cwd = std::env::temp_dir();

        let result = resolve_session_id(None, &cwd, &registry);
        match result {
            Err(SessionResolutionError::NoMatch { searched_cwd }) => {
                assert_eq!(searched_cwd, cwd);
            }
            other => panic!("Expected NoMatch error, got {:?}", other),
        }
    }

    #[test]
    fn no_sessions_returns_no_match() {
        let registry = make_registry(vec![]);
        let cwd = std::env::temp_dir();

        let result = resolve_session_id(None, &cwd, &registry);
        match result {
            Err(SessionResolutionError::NoMatch { searched_cwd }) => {
                assert_eq!(searched_cwd, cwd);
            }
            other => panic!("Expected NoMatch error, got {:?}", other),
        }
    }

    #[test]
    fn multiple_matches_returns_error_with_candidates() {
        let temp = std::env::temp_dir();
        let temp_str = temp.to_str().unwrap();
        let sessions = vec![
            make_session("s1", "Alpha", temp_str),
            make_session("s2", "Beta", temp_str),
        ];
        let registry = make_registry(sessions);

        let result = resolve_session_id(None, &temp, &registry);
        match result {
            Err(SessionResolutionError::MultipleMatches { candidates }) => {
                assert_eq!(candidates.len(), 2);
                let ids: Vec<&str> = candidates.iter().map(|(id, _)| id.as_str()).collect();
                assert!(ids.contains(&"s1"));
                assert!(ids.contains(&"s2"));
            }
            other => panic!("Expected MultipleMatches error, got {:?}", other),
        }
    }

    #[test]
    fn missing_sessions_are_skipped() {
        let temp = std::env::temp_dir();
        let sessions = vec![
            make_session("s1", "Session 1", "/nonexistent/path"),
            make_session("s2", "Session 2", temp.to_str().unwrap()),
            make_session("s3", "Session 3", "/also/nonexistent"),
        ];
        let registry = make_registry(sessions);

        let result = resolve_session_id(None, &temp, &registry);
        assert_eq!(result.unwrap(), "s2");
    }

    #[test]
    fn error_display_no_match() {
        let err = SessionResolutionError::NoMatch {
            searched_cwd: PathBuf::from("/some/path"),
        };
        let msg = format!("{}", err);
        assert!(msg.contains("/some/path"));
        assert!(msg.contains("AI Agent Workspace app"));
    }

    #[test]
    fn error_display_multiple_matches() {
        let err = SessionResolutionError::MultipleMatches {
            candidates: vec![
                ("s1".to_string(), "Alpha".to_string()),
                ("s2".to_string(), "Beta".to_string()),
            ],
        };
        let msg = format!("{}", err);
        assert!(msg.contains("Alpha"));
        assert!(msg.contains("Beta"));
        assert!(msg.contains("AIAW_SESSION_ID"));
    }
}
