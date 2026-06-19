use serde::{Deserialize, Serialize};
use schemars::JsonSchema;
use uuid::Uuid;

pub const EPSILON: f64 = 1e-6;
pub const MIN_AREA_SIZE: f64 = 0.05;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct Vertex {
    pub id: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct Edge {
    pub id: String,
    pub v1: String,
    pub v2: String,
    #[serde(default)]
    pub border: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct Area {
    pub id: String,
    pub v1: String,
    pub v2: String,
    pub v3: String,
    pub v4: String,
    pub panel_type: String,
    #[serde(default)]
    pub terminal_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, PartialEq)]
pub struct Screen {
    pub vertices: Vec<Vertex>,
    pub edges: Vec<Edge>,
    pub areas: Vec<Area>,
}

impl Screen {
    pub fn new() -> Self {
        let v_bl = Vertex {
            id: Uuid::new_v4().to_string(),
            x: 0.0,
            y: 0.0,
        };
        let v_tl = Vertex {
            id: Uuid::new_v4().to_string(),
            x: 0.0,
            y: 1.0,
        };
        let v_tr = Vertex {
            id: Uuid::new_v4().to_string(),
            x: 1.0,
            y: 1.0,
        };
        let v_br = Vertex {
            id: Uuid::new_v4().to_string(),
            x: 1.0,
            y: 0.0,
        };

        let e_top = Edge {
            id: Uuid::new_v4().to_string(),
            v1: v_tl.id.clone(),
            v2: v_tr.id.clone(),
            border: true,
        };
        let e_right = Edge {
            id: Uuid::new_v4().to_string(),
            v1: v_tr.id.clone(),
            v2: v_br.id.clone(),
            border: true,
        };
        let e_bottom = Edge {
            id: Uuid::new_v4().to_string(),
            v1: v_br.id.clone(),
            v2: v_bl.id.clone(),
            border: true,
        };
        let e_left = Edge {
            id: Uuid::new_v4().to_string(),
            v1: v_bl.id.clone(),
            v2: v_tl.id.clone(),
            border: true,
        };

        let area = Area {
            id: Uuid::new_v4().to_string(),
            v1: v_bl.id.clone(),
            v2: v_tl.id.clone(),
            v3: v_tr.id.clone(),
            v4: v_br.id.clone(),
            panel_type: "blank".to_string(),
            terminal_id: None,
        };

        Screen {
            vertices: vec![v_bl, v_tl, v_tr, v_br],
            edges: vec![e_left, e_top, e_right, e_bottom],
            areas: vec![area],
        }
    }

    pub fn default_screen() -> Self {
        Self::new()
    }

    pub fn get_vertex(&self, id: &str) -> Option<&Vertex> {
        self.vertices.iter().find(|v| v.id == id)
    }

    pub fn get_vertex_mut(&mut self, id: &str) -> Option<&mut Vertex> {
        self.vertices.iter_mut().find(|v| v.id == id)
    }

    pub fn get_edge(&self, id: &str) -> Option<&Edge> {
        self.edges.iter().find(|e| e.id == id)
    }

    pub fn get_area(&self, id: &str) -> Option<&Area> {
        self.areas.iter().find(|a| a.id == id)
    }

    pub fn get_area_mut(&mut self, id: &str) -> Option<&mut Area> {
        self.areas.iter_mut().find(|a| a.id == id)
    }
}

impl Default for Screen {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_screen_new() {
        let screen = Screen::new();
        assert_eq!(screen.vertices.len(), 4);
        assert_eq!(screen.edges.len(), 4);
        assert_eq!(screen.areas.len(), 1);
        assert!(screen.edges.iter().all(|e| e.border));
        assert_eq!(screen.areas[0].panel_type, "blank");
        assert!(screen.areas[0].terminal_id.is_none());
    }

    #[test]
    fn test_screen_vertex_positions() {
        let screen = Screen::new();
        let positions: Vec<(f64, f64)> = screen.vertices.iter().map(|v| (v.x, v.y)).collect();
        assert!(positions.contains(&(0.0, 0.0)));
        assert!(positions.contains(&(0.0, 1.0)));
        assert!(positions.contains(&(1.0, 1.0)));
        assert!(positions.contains(&(1.0, 0.0)));
    }

    #[test]
    fn test_screen_default() {
        let screen = Screen::default();
        assert_eq!(screen.vertices.len(), 4);
        assert_eq!(screen.edges.len(), 4);
        assert_eq!(screen.areas.len(), 1);
    }

    #[test]
    fn test_screen_get_vertex() {
        let screen = Screen::new();
        let vid = screen.vertices[0].id.clone();
        assert!(screen.get_vertex(&vid).is_some());
        assert_eq!(screen.get_vertex(&vid).unwrap().id, vid);
        assert!(screen.get_vertex("nonexistent").is_none());
    }

    #[test]
    fn test_screen_get_edge() {
        let screen = Screen::new();
        let eid = screen.edges[0].id.clone();
        assert!(screen.get_edge(&eid).is_some());
        assert_eq!(screen.get_edge(&eid).unwrap().id, eid);
        assert!(screen.get_edge("nonexistent").is_none());
    }

    #[test]
    fn test_screen_get_area() {
        let screen = Screen::new();
        let aid = screen.areas[0].id.clone();
        assert!(screen.get_area(&aid).is_some());
        assert_eq!(screen.get_area(&aid).unwrap().id, aid);
        assert!(screen.get_area("nonexistent").is_none());
    }

    #[test]
    fn test_screen_get_vertex_mut() {
        let mut screen = Screen::new();
        let vid = screen.vertices[0].id.clone();
        let v = screen.get_vertex_mut(&vid).unwrap();
        v.x = 0.5;
        assert!((screen.vertices[0].x - 0.5).abs() < EPSILON);
        assert!(screen.get_vertex_mut("nonexistent").is_none());
    }

    #[test]
    fn test_screen_get_area_mut() {
        let mut screen = Screen::new();
        let aid = screen.areas[0].id.clone();
        let a = screen.get_area_mut(&aid).unwrap();
        a.panel_type = "terminal".to_string();
        assert_eq!(screen.areas[0].panel_type, "terminal");
        assert!(screen.get_area_mut("nonexistent").is_none());
    }

    #[test]
    fn test_screen_get_edge_nonexistent() {
        let screen = Screen::new();
        assert!(screen.get_edge("nonexistent").is_none());
    }

    #[test]
    fn test_screen_default_screen() {
        let screen = Screen::default_screen();
        assert_eq!(screen.vertices.len(), 4);
        assert_eq!(screen.edges.len(), 4);
        assert_eq!(screen.areas.len(), 1);
    }
}
