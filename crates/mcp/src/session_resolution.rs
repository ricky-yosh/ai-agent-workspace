use std::path::{Path, PathBuf};
use ai_agent_workspace_core::repositories::SessionRepository;

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

pub fn resolve_session_id_db(
    env_session_id: Option<&str>,
    cwd: &Path,
    sessions: &SessionRepository<'_>,
) -> Result<String, SessionResolutionError> {
    if let Some(id) = env_session_id {
        return Ok(id.to_string());
    }

    let canonical_cwd = std::fs::canonicalize(cwd)
        .map_err(|_| SessionResolutionError::NoMatch {
            searched_cwd: cwd.to_path_buf(),
        })?;

    let session_list = sessions.list().unwrap_or_default();

    let mut matches: Vec<(String, String)> = Vec::new();

    for session in &session_list {
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
    use ai_agent_workspace_core::database::Database;

    fn setup_db() -> Database {
        Database::new(":memory:".into())
    }

    #[test]
    fn env_var_set_returns_immediately() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let cwd = std::env::temp_dir();

        let result = resolve_session_id_db(Some("my-session"), &cwd, &sessions);
        assert_eq!(result.unwrap(), "my-session");
    }

    #[test]
    fn env_var_set_ignores_registry() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        sessions.create("/nonexistent", "Session 1").unwrap();
        let cwd = std::env::temp_dir();

        let result = resolve_session_id_db(Some("override"), &cwd, &sessions);
        assert_eq!(result.unwrap(), "override");
    }

    #[test]
    fn single_match_returns_session_id() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let temp = std::env::temp_dir();
        let s1 = sessions.create(temp.to_str().unwrap(), "Session 1").unwrap();
        sessions.create("/nonexistent/path", "Session 2").unwrap();

        let result = resolve_session_id_db(None, &temp, &sessions);
        assert_eq!(result.unwrap(), s1.id);
    }

    #[test]
    fn no_match_returns_error() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        sessions.create("/nonexistent/path/a", "Session 1").unwrap();
        sessions.create("/nonexistent/path/b", "Session 2").unwrap();
        let cwd = std::env::temp_dir();

        let result = resolve_session_id_db(None, &cwd, &sessions);
        match result {
            Err(SessionResolutionError::NoMatch { searched_cwd }) => {
                assert_eq!(searched_cwd, cwd);
            }
            other => panic!("Expected NoMatch error, got {:?}", other),
        }
    }

    #[test]
    fn no_sessions_returns_no_match() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let cwd = std::env::temp_dir();

        let result = resolve_session_id_db(None, &cwd, &sessions);
        match result {
            Err(SessionResolutionError::NoMatch { searched_cwd }) => {
                assert_eq!(searched_cwd, cwd);
            }
            other => panic!("Expected NoMatch error, got {:?}", other),
        }
    }

    #[test]
    fn multiple_matches_returns_error_with_candidates() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let temp = std::env::temp_dir();
        let temp_str = temp.to_str().unwrap();
        sessions.create(temp_str, "Alpha").unwrap();
        sessions.create(temp_str, "Beta").unwrap();

        let result = resolve_session_id_db(None, &temp, &sessions);
        match result {
            Err(SessionResolutionError::MultipleMatches { candidates }) => {
                assert_eq!(candidates.len(), 2);
            }
            other => panic!("Expected MultipleMatches error, got {:?}", other),
        }
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
