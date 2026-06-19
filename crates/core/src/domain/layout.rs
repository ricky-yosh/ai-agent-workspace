use serde::{Deserialize, Serialize};
use schemars::JsonSchema;

use super::screen::Screen;

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

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct Layout {
    pub id: String,
    pub name: String,
    pub screen: Screen,
    #[serde(default)]
    pub built_in: bool,
}


