use std::path::PathBuf;
use ai_agent_workspace_core::database::Database;

pub struct AppState {
    pub db: Database,
}

impl AppState {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db: Database::new(db_path),
        }
    }

    pub fn new_default() -> Self {
        let data_dir = dirs::data_dir().expect("No data directory");
        let db_path = data_dir.join("AI Agent Workspace").join("workspace.db");
        Self::new(db_path)
    }
}
