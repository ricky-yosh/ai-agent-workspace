use serde::{Deserialize, Serialize};
use schemars::JsonSchema;

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
        #[serde(default)]
        terminal_id: Option<String>,
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
    #[serde(default)]
    pub built_in: bool,
}

impl LayoutTree {
    pub fn default_layout() -> Self {
        LayoutTree {
            tree: LayoutNode::Panel {
                panel_type: "blank".into(),
                terminal_id: None,
            },
        }
    }
}
