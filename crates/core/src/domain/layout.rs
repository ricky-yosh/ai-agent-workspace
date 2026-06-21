use serde::{Deserialize, Serialize};
use schemars::JsonSchema;

use super::screen::Screen;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct Layout {
    pub id: String,
    pub name: String,
    pub screen: Screen,
    #[serde(default)]
    pub built_in: bool,
}


