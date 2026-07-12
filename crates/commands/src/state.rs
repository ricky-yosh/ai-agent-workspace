use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use ai_agent_workspace_core::database::Database;

pub struct AppState {
    pub db: Database,
    pub index_cancel_flag: Arc<AtomicBool>,
}

impl AppState {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db: Database::new(db_path),
            index_cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn new_default() -> Self {
        let data_dir = dirs::data_dir().expect("No data directory");
        let db_path = data_dir.join("AI Agent Workspace").join("workspace.db");
        Self::new(db_path)
    }
}
