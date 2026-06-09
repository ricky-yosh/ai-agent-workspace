use std::path::PathBuf;
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use serde::{Deserialize, Serialize};
use schemars::JsonSchema;
use uuid::Uuid;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Vertical,
    Horizontal,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LayoutNode {
    Split {
        direction: Direction,
        ratio: f64,
        children: Vec<LayoutNode>,
    },
    Panel {
        panel_type: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct LayoutTree {
    pub tree: LayoutNode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Layout {
    pub id: String,
    pub name: String,
    pub tree: LayoutTree,
}

#[derive(Debug, Error)]
pub enum LayoutError {
    #[error("Layout not found: {0}")]
    NotFound(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Data directory not available")]
    NoDataDir,
}

pub type Result<T> = std::result::Result<T, LayoutError>;

pub struct LayoutStore {
    file_path: PathBuf,
    layouts: Vec<Layout>,
    suppress_watcher: AtomicBool,
}

impl LayoutStore {
    pub fn new() -> Result<Self> {
        let data_dir = dirs::data_dir().ok_or(LayoutError::NoDataDir)?;
        let file_path = data_dir.join("AI Agent Workspace").join("layouts.json");
        Self::new_with_path(file_path)
    }

    pub fn new_with_path(file_path: PathBuf) -> Result<Self> {
        let layouts = if file_path.exists() {
            let content = fs::read_to_string(&file_path)?;
            if content.trim().is_empty() {
                Vec::new()
            } else {
                serde_json::from_str(&content)?
            }
        } else {
            Vec::new()
        };

        Ok(LayoutStore {
            file_path,
            layouts,
            suppress_watcher: AtomicBool::new(false),
        })
    }

    pub fn save_layout(&mut self, name: &str, tree: LayoutTree) -> Result<Layout> {
        let layout = Layout {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            tree,
        };
        self.layouts.push(layout.clone());
        Ok(layout)
    }

    pub fn list_layouts(&self) -> Result<Vec<Layout>> {
        Ok(self.layouts.clone())
    }

    pub fn get_layout(&self, id: &str) -> Result<Layout> {
        self.layouts
            .iter()
            .find(|l| l.id == id)
            .cloned()
            .ok_or_else(|| LayoutError::NotFound(id.to_string()))
    }

    pub fn delete_layout(&mut self, id: &str) -> Result<()> {
        let idx = self
            .layouts
            .iter()
            .position(|l| l.id == id)
            .ok_or_else(|| LayoutError::NotFound(id.to_string()))?;
        self.layouts.remove(idx);
        Ok(())
    }

    pub fn rename_layout(&mut self, id: &str, new_name: &str) -> Result<()> {
        let layout = self
            .layouts
            .iter_mut()
            .find(|l| l.id == id)
            .ok_or_else(|| LayoutError::NotFound(id.to_string()))?;
        layout.name = new_name.to_string();
        Ok(())
    }

    pub fn default_layout() -> LayoutTree {
        LayoutTree {
            tree: LayoutNode::Panel {
                panel_type: "blank".into(),
            },
        }
    }

    pub fn save(&self) -> Result<()> {
        self.suppress_watcher.store(true, Ordering::SeqCst);
        let result = (|| {
            if let Some(parent) = self.file_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let content = serde_json::to_string_pretty(&self.layouts)?;
            fs::write(&self.file_path, content)?;
            Ok::<(), LayoutError>(())
        })();
        self.suppress_watcher.store(false, Ordering::SeqCst);
        result
    }

    pub fn should_suppress_watcher(&self) -> bool {
        self.suppress_watcher.load(Ordering::SeqCst)
    }

    pub fn reload(&mut self) -> Result<()> {
        if self.file_path.exists() {
            let content = fs::read_to_string(&self.file_path)?;
            if content.trim().is_empty() {
                self.layouts = Vec::new();
            } else {
                self.layouts = serde_json::from_str(&content)?;
            }
        } else {
            self.layouts = Vec::new();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup() -> (LayoutStore, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("layouts.json");
        let store = LayoutStore::new_with_path(file_path).unwrap();
        (store, temp_dir)
    }

    #[test]
    fn test_save_layout() {
        let (mut store, _tmp) = setup();
        let tree = LayoutStore::default_layout();
        let layout = store.save_layout("My Layout", tree.clone()).unwrap();
        assert!(!layout.id.is_empty());
        assert_eq!(layout.name, "My Layout");
        assert_eq!(layout.tree, tree);
    }

    #[test]
    fn test_list_layouts() {
        let (mut store, _tmp) = setup();
        let tree = LayoutStore::default_layout();
        store.save_layout("Layout 1", tree.clone()).unwrap();
        store.save_layout("Layout 2", tree.clone()).unwrap();
        let layouts = store.list_layouts().unwrap();
        assert_eq!(layouts.len(), 2);
    }

    #[test]
    fn test_get_layout() {
        let (mut store, _tmp) = setup();
        let tree = LayoutStore::default_layout();
        let saved = store.save_layout("Test", tree).unwrap();
        let found = store.get_layout(&saved.id).unwrap();
        assert_eq!(found.id, saved.id);
        assert_eq!(found.name, "Test");
    }

    #[test]
    fn test_delete_layout() {
        let (mut store, _tmp) = setup();
        let tree = LayoutStore::default_layout();
        let l1 = store.save_layout("A", tree.clone()).unwrap();
        let l2 = store.save_layout("B", tree).unwrap();
        store.delete_layout(&l1.id).unwrap();
        let layouts = store.list_layouts().unwrap();
        assert_eq!(layouts.len(), 1);
        assert_eq!(layouts[0].id, l2.id);
    }

    #[test]
    fn test_get_layout_not_found() {
        let (store, _tmp) = setup();
        let result = store.get_layout("nonexistent-id");
        assert!(result.is_err());
        match result {
            Err(LayoutError::NotFound(_)) => {}
            _ => panic!("Expected NotFound error"),
        }
    }

    #[test]
    fn test_default_layout() {
        let tree = LayoutStore::default_layout();
        match tree.tree {
            LayoutNode::Panel { ref panel_type } => assert_eq!(panel_type, "blank"),
            _ => panic!("Expected Panel variant with panel_type 'blank'"),
        }
    }

    #[test]
    fn test_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("layouts.json");

        let tree = LayoutTree {
            tree: LayoutNode::Split {
                direction: Direction::Vertical,
                ratio: 0.5,
                children: vec![
                    LayoutNode::Panel {
                        panel_type: "blank".into(),
                    },
                    LayoutNode::Panel {
                        panel_type: "tasks".into(),
                    },
                ],
            },
        };

        {
            let mut store = LayoutStore::new_with_path(file_path.clone()).unwrap();
            store.save_layout("Persisted", tree.clone()).unwrap();
            store.save().unwrap();
        }

        {
            let store = LayoutStore::new_with_path(file_path.clone()).unwrap();
            let layouts = store.list_layouts().unwrap();
            assert_eq!(layouts.len(), 1);
            assert_eq!(layouts[0].name, "Persisted");
            assert_eq!(layouts[0].tree, tree);
        }
    }

    #[test]
    fn test_missing_file() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("layouts.json");
        let store = LayoutStore::new_with_path(file_path).unwrap();
        assert!(store.list_layouts().unwrap().is_empty());
    }
}
