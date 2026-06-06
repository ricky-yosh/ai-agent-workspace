use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: u32,
    pub description: String,
    pub status: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub effort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskInput {
    pub description: String,
    pub status: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub effort: String,
}

pub struct TaskStore;

impl TaskStore {
    pub fn new() -> Self {
        TaskStore
    }

    pub fn read_tasks(&self, path: &Path) -> Result<Vec<Task>, String> {
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(path).map_err(|e| format!("Failed to read tasks file: {e}"))?;
        if content.trim().is_empty() {
            return Ok(Vec::new());
        }
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse tasks file: {e}"))
    }

    pub fn add_task(&self, path: &Path, input: TaskInput) -> Result<Task, String> {
        let mut tasks = self.read_tasks(path)?;
        let new_id = tasks.iter().map(|t| t.id).max().unwrap_or(0) + 1;
        let task = Task {
            id: new_id,
            description: input.description,
            status: input.status,
            task_type: input.task_type,
            effort: input.effort,
        };
        tasks.push(task.clone());
        Self::write_tasks(path, &tasks)?;
        Ok(task)
    }

    pub fn update_task(&self, path: &Path, task_id: u32, description: String, status: String) -> Result<Task, String> {
        let mut tasks = self.read_tasks(path)?;
        let task = tasks
            .iter_mut()
            .find(|t| t.id == task_id)
            .ok_or_else(|| format!("Task with id {task_id} not found"))?;
        task.description = description;
        task.status = status;
        let result = task.clone();
        Self::write_tasks(path, &tasks)?;
        Ok(result)
    }

    fn write_tasks(path: &Path, tasks: &[Task]) -> Result<(), String> {
        let content = serde_json::to_string_pretty(tasks)
            .map_err(|e| format!("Failed to serialize tasks: {e}"))?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create tasks directory: {e}"))?;
        }
        fs::write(path, content).map_err(|e| format!("Failed to write tasks file: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup() -> (TempDir, std::path::PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("tasks.json");
        (temp_dir, path)
    }

    #[test]
    fn test_read_empty() {
        let (_tmp, path) = setup();
        let store = TaskStore::new();
        let tasks = store.read_tasks(&path).unwrap();
        assert!(tasks.is_empty());
    }

    #[test]
    fn test_read_malformed() {
        let (_tmp, path) = setup();
        fs::write(&path, "not valid json").unwrap();
        let store = TaskStore::new();
        let result = store.read_tasks(&path);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_task() {
        let (_tmp, path) = setup();
        let store = TaskStore::new();
        let input = TaskInput {
            description: "Test task".into(),
            status: "pending".into(),
            task_type: "AFK".into(),
            effort: "medium".into(),
        };
        let task = store.add_task(&path, input).unwrap();
        assert_eq!(task.id, 1);
        assert_eq!(task.description, "Test task");
        assert_eq!(task.status, "pending");
        assert_eq!(task.task_type, "AFK");
        assert_eq!(task.effort, "medium");
    }

    #[test]
    fn test_add_second_task() {
        let (_tmp, path) = setup();
        let store = TaskStore::new();
        let input = TaskInput {
            description: "First".into(),
            status: "pending".into(),
            task_type: "AFK".into(),
            effort: "low".into(),
        };
        store.add_task(&path, input).unwrap();
        let input = TaskInput {
            description: "Second".into(),
            status: "in_progress".into(),
            task_type: "HITL".into(),
            effort: "high".into(),
        };
        let task = store.add_task(&path, input).unwrap();
        assert_eq!(task.id, 2);
        assert_eq!(task.description, "Second");
    }

    #[test]
    fn test_update_task() {
        let (_tmp, path) = setup();
        let store = TaskStore::new();
        let input = TaskInput {
            description: "Original".into(),
            status: "pending".into(),
            task_type: "AFK".into(),
            effort: "low".into(),
        };
        let added = store.add_task(&path, input).unwrap();
        let updated = store.update_task(&path, added.id, "Updated desc".into(), "completed".into()).unwrap();
        assert_eq!(updated.id, added.id);
        assert_eq!(updated.description, "Updated desc");
        assert_eq!(updated.status, "completed");
    }

    #[test]
    fn test_update_nonexistent() {
        let (_tmp, path) = setup();
        let store = TaskStore::new();
        let result = store.update_task(&path, 999, "desc".into(), "completed".into());
        assert!(result.is_err());
    }

    #[test]
    fn test_persistence() {
        let (_tmp, path) = setup();
        let store = TaskStore::new();
        let input = TaskInput {
            description: "Persistent task".into(),
            status: "pending".into(),
            task_type: "HITL".into(),
            effort: "high".into(),
        };
        store.add_task(&path, input).unwrap();
        let tasks = store.read_tasks(&path).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].description, "Persistent task");
    }
}
