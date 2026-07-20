use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Whether a source reference points at a file in the working directory or an
/// external link. Restores the `('file','link')` invariant the dropped
/// `canvas_node_sources` table enforced via a CHECK constraint (see ADR 0025).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum SourceType {
    File,
    Link,
}

/// A source reference entry stored inline on a `CanvasNode`'s `sources_json`
/// field (see ADR 0025). Replaces the first-class `canvas_node_sources` row.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct NodeSource {
    pub url: String,
    pub source_type: SourceType,
    pub sort_order: i32,
}
