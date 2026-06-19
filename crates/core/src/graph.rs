use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use schemars::JsonSchema;
use uuid::Uuid;
use crate::domain::screen::{Screen, Vertex, Edge, Area, EPSILON, MIN_AREA_SIZE};
use crate::domain::{Direction, LayoutNode, LayoutTree};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Axis {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Adjacency {
    North,
    South,
    East,
    West,
}

fn edge_signature(v1: &str, v2: &str) -> (String, String) {
    if v1 < v2 {
        (v1.to_string(), v2.to_string())
    } else {
        (v2.to_string(), v1.to_string())
    }
}

pub fn find_edge<'a>(screen: &'a Screen, v1_id: &str, v2_id: &str) -> Option<&'a Edge> {
    screen.edges.iter().find(|e| {
        (e.v1 == v1_id && e.v2 == v2_id) || (e.v1 == v2_id && e.v2 == v1_id)
    })
}

pub fn find_area_at_point(screen: &Screen, x: f64, y: f64) -> Option<&Area> {
    screen.areas.iter().find(|area| {
        let v1 = match screen.vertices.iter().find(|v| v.id == area.v1) {
            Some(v) => v,
            None => return false,
        };
        let v2 = match screen.vertices.iter().find(|v| v.id == area.v2) {
            Some(v) => v,
            None => return false,
        };
        let v3 = match screen.vertices.iter().find(|v| v.id == area.v3) {
            Some(v) => v,
            None => return false,
        };
        let left = v1.x.min(v3.x);
        let right = v1.x.max(v3.x);
        let bottom = v1.y.min(v2.y);
        let top = v1.y.max(v2.y);
        x >= left - EPSILON && x <= right + EPSILON && y >= bottom - EPSILON && y <= top + EPSILON
    })
}

pub fn find_active_edge(screen: &Screen, x: f64, y: f64, tolerance: f64) -> Option<&Edge> {
    screen.edges.iter().filter(|e| !e.border).find(|edge| {
        let v1 = match screen.vertices.iter().find(|v| v.id == edge.v1) {
            Some(v) => v,
            None => return false,
        };
        let v2 = match screen.vertices.iter().find(|v| v.id == edge.v2) {
            Some(v) => v,
            None => return false,
        };
        if (v1.y - v2.y).abs() < EPSILON {
            if (y - v1.y).abs() <= tolerance {
                let min_x = v1.x.min(v2.x);
                let max_x = v1.x.max(v2.x);
                x >= min_x && x <= max_x
            } else {
                false
            }
        } else if (v1.x - v2.x).abs() < EPSILON {
            if (x - v1.x).abs() <= tolerance {
                let min_y = v1.y.min(v2.y);
                let max_y = v1.y.max(v2.y);
                y >= min_y && y <= max_y
            } else {
                false
            }
        } else {
            false
        }
    })
}

pub fn is_edge_horizontal(screen: &Screen, edge: &Edge) -> bool {
    let v1 = match screen.vertices.iter().find(|v| v.id == edge.v1) {
        Some(v) => v,
        None => return false,
    };
    let v2 = match screen.vertices.iter().find(|v| v.id == edge.v2) {
        Some(v) => v,
        None => return false,
    };
    (v1.y - v2.y).abs() < EPSILON
}

pub fn is_edge_vertical(screen: &Screen, edge: &Edge) -> bool {
    let v1 = match screen.vertices.iter().find(|v| v.id == edge.v1) {
        Some(v) => v,
        None => return false,
    };
    let v2 = match screen.vertices.iter().find(|v| v.id == edge.v2) {
        Some(v) => v,
        None => return false,
    };
    (v1.x - v2.x).abs() < EPSILON
}

pub fn area_bounds(screen: &Screen, area: &Area) -> Option<(f64, f64, f64, f64)> {
    let v1 = screen.vertices.iter().find(|v| v.id == area.v1)?;
    let _v2 = screen.vertices.iter().find(|v| v.id == area.v2)?;
    let v3 = screen.vertices.iter().find(|v| v.id == area.v3)?;
    Some((v1.x, v1.y, v3.x, v3.y))
}

pub fn area_width(screen: &Screen, area: &Area) -> Option<f64> {
    let (left, _, right, _) = area_bounds(screen, area)?;
    Some(right - left)
}

pub fn area_height(screen: &Screen, area: &Area) -> Option<f64> {
    let (_, bottom, _, top) = area_bounds(screen, area)?;
    Some(top - bottom)
}

pub fn get_adjacency(screen: &Screen, area_a_id: &str, area_b_id: &str) -> Option<Adjacency> {
    let area_a = screen.areas.iter().find(|a| a.id == area_a_id)?;
    let area_b = screen.areas.iter().find(|a| a.id == area_b_id)?;

    let (left_a, bottom_a, right_a, top_a) = area_bounds(screen, area_a)?;
    let (left_b, bottom_b, right_b, top_b) = area_bounds(screen, area_b)?;

    let overlap_x = right_a.min(right_b) - left_a.max(left_b);
    let overlap_y = top_a.min(top_b) - bottom_a.max(bottom_b);
    let min_overlap = MIN_AREA_SIZE;

    if (top_a - bottom_b).abs() < EPSILON && overlap_x >= min_overlap {
        Some(Adjacency::North)
    } else if (bottom_a - top_b).abs() < EPSILON && overlap_x >= min_overlap {
        Some(Adjacency::South)
    } else if (right_a - left_b).abs() < EPSILON && overlap_y >= min_overlap {
        Some(Adjacency::East)
    } else if (left_a - right_b).abs() < EPSILON && overlap_y >= min_overlap {
        Some(Adjacency::West)
    } else {
        None
    }
}

fn edge_vertices_in_set(edge: &Edge, set: &HashSet<String>) -> usize {
    let mut count = 0;
    if set.contains(&edge.v1) {
        count += 1;
    }
    if set.contains(&edge.v2) {
        count += 1;
    }
    count
}

pub fn select_connected_vertices(screen: &Screen, edge_id: &str) -> Vec<String> {
    let start_edge = match screen.edges.iter().find(|e| e.id == edge_id) {
        Some(e) => e,
        None => return Vec::new(),
    };

    let v1 = match screen.vertices.iter().find(|v| v.id == start_edge.v1) {
        Some(v) => v,
        None => return Vec::new(),
    };
    let v2 = match screen.vertices.iter().find(|v| v.id == start_edge.v2) {
        Some(v) => v,
        None => return Vec::new(),
    };

    let is_horizontal_start = (v1.y - v2.y).abs() < EPSILON;

    let mut selected: HashSet<String> = HashSet::new();
    selected.insert(start_edge.v1.clone());
    selected.insert(start_edge.v2.clone());

    loop {
        let mut changed = false;
        for edge in &screen.edges {
            if edge_vertices_in_set(edge, &selected) != 1 {
                continue;
            }
            let same_direction = if is_horizontal_start {
                match (
                    screen.vertices.iter().find(|v| v.id == edge.v1),
                    screen.vertices.iter().find(|v| v.id == edge.v2),
                ) {
                    (Some(ev1), Some(ev2)) => (ev1.y - ev2.y).abs() < EPSILON,
                    _ => false,
                }
            } else {
                match (
                    screen.vertices.iter().find(|v| v.id == edge.v1),
                    screen.vertices.iter().find(|v| v.id == edge.v2),
                ) {
                    (Some(ev1), Some(ev2)) => (ev1.x - ev2.x).abs() < EPSILON,
                    _ => false,
                }
            };

            if same_direction {
                if selected.insert(edge.v1.clone()) {
                    changed = true;
                }
                if selected.insert(edge.v2.clone()) {
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }

    let mut result: Vec<String> = selected.into_iter().collect();
    result.sort();
    result
}

pub fn remove_duplicate_edges(screen: &mut Screen) {
    let mut seen: HashSet<(String, String)> = HashSet::new();
    screen.edges.retain(|edge| {
        let sig = edge_signature(&edge.v1, &edge.v2);
        seen.insert(sig)
    });
}

pub fn remove_unused_edges(screen: &mut Screen) {
    let mut used: HashSet<(String, String)> = HashSet::new();
    for area in &screen.areas {
        used.insert(edge_signature(&area.v1, &area.v2));
        used.insert(edge_signature(&area.v2, &area.v3));
        used.insert(edge_signature(&area.v3, &area.v4));
        used.insert(edge_signature(&area.v4, &area.v1));
    }
    screen.edges.retain(|edge| {
        let sig = edge_signature(&edge.v1, &edge.v2);
        used.contains(&sig)
    });
}

pub fn remove_unused_vertices(screen: &mut Screen) {
    let used: HashSet<String> = screen
        .edges
        .iter()
        .flat_map(|e| [e.v1.clone(), e.v2.clone()])
        .collect();
    screen.vertices.retain(|v| used.contains(&v.id));
}

pub fn remove_duplicate_vertices(screen: &mut Screen) {
    let mut pos_map: HashMap<(String, String), String> = HashMap::new();
    let mut remap: HashMap<String, String> = HashMap::new();

    for v in &screen.vertices {
        let key = (format!("{:.6}", v.x), format!("{:.6}", v.y));
        if let Some(canonical) = pos_map.get(&key) {
            remap.insert(v.id.clone(), canonical.clone());
        } else {
            pos_map.insert(key, v.id.clone());
        }
    }

    if remap.is_empty() {
        return;
    }

    for edge in &mut screen.edges {
        if let Some(canonical) = remap.get(&edge.v1).cloned() {
            edge.v1 = canonical;
        }
        if let Some(canonical) = remap.get(&edge.v2).cloned() {
            edge.v2 = canonical;
        }
    }

    for area in &mut screen.areas {
        if let Some(canonical) = remap.get(&area.v1).cloned() {
            area.v1 = canonical;
        }
        if let Some(canonical) = remap.get(&area.v2).cloned() {
            area.v2 = canonical;
        }
        if let Some(canonical) = remap.get(&area.v3).cloned() {
            area.v3 = canonical;
        }
        if let Some(canonical) = remap.get(&area.v4).cloned() {
            area.v4 = canonical;
        }
    }

    screen.vertices.retain(|v| !remap.contains_key(&v.id));

    remove_duplicate_edges(screen);
}

pub fn cleanup(screen: &mut Screen) {
    remove_duplicate_edges(screen);
    remove_unused_edges(screen);
    remove_unused_vertices(screen);
    remove_duplicate_vertices(screen);
}

pub fn validate_screen(screen: &Screen) -> Result<(), String> {
    let vertex_ids: HashSet<String> = screen.vertices.iter().map(|v| v.id.clone()).collect();

    for area in &screen.areas {
        for vid in [area.v1.as_str(), area.v2.as_str(), area.v3.as_str(), area.v4.as_str()] {
            if !vertex_ids.contains(vid) {
                return Err(format!("Area {} references missing vertex {}", area.id, vid));
            }
        }
    }

    for edge in &screen.edges {
        if !vertex_ids.contains(edge.v1.as_str()) {
            return Err(format!("Edge {} references missing vertex {}", edge.id, edge.v1));
        }
        if !vertex_ids.contains(edge.v2.as_str()) {
            return Err(format!("Edge {} references missing vertex {}", edge.id, edge.v2));
        }
    }

    for area in &screen.areas {
        let v1 = screen.vertices.iter().find(|v| v.id == area.v1).unwrap();
        let v2 = screen.vertices.iter().find(|v| v.id == area.v2).unwrap();
        let v3 = screen.vertices.iter().find(|v| v.id == area.v3).unwrap();
        let v4 = screen.vertices.iter().find(|v| v.id == area.v4).unwrap();

        if (v1.x - v2.x).abs() >= EPSILON {
            return Err(format!("Area {} is not a rectangle: v1.x ({}) != v2.x ({})", area.id, v1.x, v2.x));
        }
        if (v3.x - v4.x).abs() >= EPSILON {
            return Err(format!("Area {} is not a rectangle: v3.x ({}) != v4.x ({})", area.id, v3.x, v4.x));
        }
        if (v1.y - v4.y).abs() >= EPSILON {
            return Err(format!("Area {} is not a rectangle: v1.y ({}) != v4.y ({})", area.id, v1.y, v4.y));
        }
        if (v2.y - v3.y).abs() >= EPSILON {
            return Err(format!("Area {} is not a rectangle: v2.y ({}) != v3.y ({})", area.id, v2.y, v3.y));
        }
    }

    for edge in &screen.edges {
        let v1 = screen.vertices.iter().find(|v| v.id == edge.v1).unwrap();
        let v2 = screen.vertices.iter().find(|v| v.id == edge.v2).unwrap();
        let dx = (v1.x - v2.x).abs();
        let dy = (v1.y - v2.y).abs();
        if dx >= EPSILON && dy >= EPSILON {
            return Err(format!("Edge {} is not axis-aligned: dx={}, dy={}", edge.id, dx, dy));
        }
    }

    let mut pos_set: HashSet<(String, String)> = HashSet::new();
    for v in &screen.vertices {
        let key = (format!("{:.6}", v.x), format!("{:.6}", v.y));
        if !pos_set.insert(key) {
            return Err(format!("Duplicate vertex at ({}, {})", v.x, v.y));
        }
    }

    let mut edge_set: HashSet<(String, String)> = HashSet::new();
    for edge in &screen.edges {
        let sig = edge_signature(&edge.v1, &edge.v2);
        if !edge_set.insert(sig) {
            return Err(format!("Duplicate edge {}<->{}", edge.v1, edge.v2));
        }
    }

    let edge_used: HashSet<(String, String)> = screen
        .areas
        .iter()
        .flat_map(|a| {
            [
                edge_signature(&a.v1, &a.v2),
                edge_signature(&a.v2, &a.v3),
                edge_signature(&a.v3, &a.v4),
                edge_signature(&a.v4, &a.v1),
            ]
        })
        .collect();
    for edge in &screen.edges {
        let sig = edge_signature(&edge.v1, &edge.v2);
        if !edge_used.contains(&sig) {
            return Err(format!("Orphan edge {} ({} - {})", edge.id, edge.v1, edge.v2));
        }
    }

    let vertex_used: HashSet<String> = screen
        .edges
        .iter()
        .flat_map(|e| [e.v1.clone(), e.v2.clone()])
        .collect();
    for v in &screen.vertices {
        if !vertex_used.contains(&v.id) {
            return Err(format!("Orphan vertex {} at ({}, {})", v.id, v.x, v.y));
        }
    }

    for area in &screen.areas {
        if let Some(w) = area_width(screen, area) {
            if w < MIN_AREA_SIZE - EPSILON {
                return Err(format!("Area {} width {} is below minimum {}", area.id, w, MIN_AREA_SIZE));
            }
        }
        if let Some(h) = area_height(screen, area) {
            if h < MIN_AREA_SIZE - EPSILON {
                return Err(format!("Area {} height {} is below minimum {}", area.id, h, MIN_AREA_SIZE));
            }
        }
    }

    Ok(())
}

pub fn area_split(screen: &mut Screen, area_id: &str, axis: Axis, factor: f64) -> Result<String, String> {
    let (old_v1, old_v2, old_v3, old_v4, old_panel_type, old_terminal_id) = {
        let old_area = screen.get_area(area_id).ok_or_else(|| "Area not found".to_string())?;
        (
            old_area.v1.clone(),
            old_area.v2.clone(),
            old_area.v3.clone(),
            old_area.v4.clone(),
            old_area.panel_type.clone(),
            old_area.terminal_id.clone(),
        )
    };

    let (x1, y1, y2, x4) = {
        let v1 = screen.vertices.iter().find(|v| v.id == old_v1).ok_or("Missing vertex")?;
        let v2 = screen.vertices.iter().find(|v| v.id == old_v2).ok_or("Missing vertex")?;
        let v4 = screen.vertices.iter().find(|v| v.id == old_v4).ok_or("Missing vertex")?;
        (v1.x, v1.y, v2.y, v4.x)
    };
    let total_w = x4 - x1;
    let total_h = y2 - y1;

    let (new_area, old_area_mod) = match axis {
        Axis::Horizontal => {
            let mut split_y = y1 + factor * total_h;
            if total_h < 2.0 * MIN_AREA_SIZE {
                return Err("Area too small to split".to_string());
            }
            if split_y - y1 < MIN_AREA_SIZE {
                split_y = y1 + MIN_AREA_SIZE;
            }
            if y2 - split_y < MIN_AREA_SIZE {
                split_y = y2 - MIN_AREA_SIZE;
            }

            let sv1 = Vertex { id: Uuid::new_v4().to_string(), x: x1, y: split_y };
            let sv2 = Vertex { id: Uuid::new_v4().to_string(), x: x4, y: split_y };

            let sv1_id = sv1.id.clone();
            let sv2_id = sv2.id.clone();

            screen.vertices.push(sv1);
            screen.vertices.push(sv2);

            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: old_v1.clone(), v2: sv1_id.clone(), border: false });
            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: sv1_id.clone(), v2: old_v2.clone(), border: false });
            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: old_v3.clone(), v2: sv2_id.clone(), border: false });
            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: sv2_id.clone(), v2: old_v4.clone(), border: false });
            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: sv1_id.clone(), v2: sv2_id.clone(), border: false });

            if factor > 0.5 {
                // new on TOP
                let new_a = Area {
                    id: Uuid::new_v4().to_string(),
                    v1: sv1_id.clone(),
                    v2: old_v2.clone(),
                    v3: old_v3.clone(),
                    v4: sv2_id.clone(),
                    panel_type: old_panel_type.clone(),
                    terminal_id: None,
                };
                let old_mod = Area {
                    id: area_id.to_string(),
                    v1: old_v1.clone(),
                    v2: sv1_id.clone(),
                    v3: sv2_id.clone(),
                    v4: old_v4.clone(),
                    panel_type: old_panel_type,
                    terminal_id: old_terminal_id,
                };
                (new_a, old_mod)
            } else {
                // new on BOTTOM
                let new_a = Area {
                    id: Uuid::new_v4().to_string(),
                    v1: old_v1.clone(),
                    v2: sv1_id.clone(),
                    v3: sv2_id.clone(),
                    v4: old_v4.clone(),
                    panel_type: old_panel_type.clone(),
                    terminal_id: None,
                };
                let old_mod = Area {
                    id: area_id.to_string(),
                    v1: sv1_id.clone(),
                    v2: old_v2.clone(),
                    v3: old_v3.clone(),
                    v4: sv2_id.clone(),
                    panel_type: old_panel_type,
                    terminal_id: old_terminal_id,
                };
                (new_a, old_mod)
            }
        }
        Axis::Vertical => {
            let mut split_x = x1 + factor * total_w;
            if total_w < 2.0 * MIN_AREA_SIZE {
                return Err("Area too small to split".to_string());
            }
            if split_x - x1 < MIN_AREA_SIZE {
                split_x = x1 + MIN_AREA_SIZE;
            }
            if x4 - split_x < MIN_AREA_SIZE {
                split_x = x4 - MIN_AREA_SIZE;
            }

            let sv1 = Vertex { id: Uuid::new_v4().to_string(), x: split_x, y: y1 };
            let sv2 = Vertex { id: Uuid::new_v4().to_string(), x: split_x, y: y2 };

            let sv1_id = sv1.id.clone();
            let sv2_id = sv2.id.clone();

            screen.vertices.push(sv1);
            screen.vertices.push(sv2);

            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: old_v1.clone(), v2: sv1_id.clone(), border: false });
            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: sv1_id.clone(), v2: old_v4.clone(), border: false });
            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: old_v2.clone(), v2: sv2_id.clone(), border: false });
            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: sv2_id.clone(), v2: old_v3.clone(), border: false });
            screen.edges.push(Edge { id: Uuid::new_v4().to_string(), v1: sv1_id.clone(), v2: sv2_id.clone(), border: false });

            if factor > 0.5 {
                // new on RIGHT
                let new_a = Area {
                    id: Uuid::new_v4().to_string(),
                    v1: sv1_id.clone(),
                    v2: sv2_id.clone(),
                    v3: old_v3.clone(),
                    v4: old_v4.clone(),
                    panel_type: old_panel_type.clone(),
                    terminal_id: None,
                };
                let old_mod = Area {
                    id: area_id.to_string(),
                    v1: old_v1.clone(),
                    v2: old_v2.clone(),
                    v3: sv2_id.clone(),
                    v4: sv1_id.clone(),
                    panel_type: old_panel_type,
                    terminal_id: old_terminal_id,
                };
                (new_a, old_mod)
            } else {
                // new on LEFT
                let new_a = Area {
                    id: Uuid::new_v4().to_string(),
                    v1: old_v1.clone(),
                    v2: old_v2.clone(),
                    v3: sv2_id.clone(),
                    v4: sv1_id.clone(),
                    panel_type: old_panel_type.clone(),
                    terminal_id: None,
                };
                let old_mod = Area {
                    id: area_id.to_string(),
                    v1: sv1_id.clone(),
                    v2: sv2_id.clone(),
                    v3: old_v3.clone(),
                    v4: old_v4.clone(),
                    panel_type: old_panel_type,
                    terminal_id: old_terminal_id,
                };
                (new_a, old_mod)
            }
        }
    };

    let new_area_id = new_area.id.clone();

    // Replace the old area and add the new one
    if let Some(old_idx) = screen.areas.iter().position(|a| a.id == area_id) {
        screen.areas[old_idx] = old_area_mod;
    }
    screen.areas.push(new_area);

    remove_duplicate_edges(screen);
    remove_unused_edges(screen);

    Ok(new_area_id)
}

pub fn screen_area_join(screen: &mut Screen, survivor_id: &str, absorbed_id: &str) -> Result<(), String> {
    let adj = get_adjacency(screen, survivor_id, absorbed_id)
        .ok_or_else(|| "Areas are not adjacent".to_string())?;

    // Clone all needed data before mutations
    let (absorbed_v1, absorbed_v2, absorbed_v3, absorbed_v4) = {
        let absorbed = screen.get_area(absorbed_id)
            .ok_or_else(|| "Area not found".to_string())?;
        (absorbed.v1.clone(), absorbed.v2.clone(), absorbed.v3.clone(), absorbed.v4.clone())
    };

    let (surv_v1, surv_v2, surv_v3, surv_v4, surv_panel_type, surv_terminal_id) = {
        let survivor = screen.get_area(survivor_id)
            .ok_or_else(|| "Area not found".to_string())?;
        (
            survivor.v1.clone(),
            survivor.v2.clone(),
            survivor.v3.clone(),
            survivor.v4.clone(),
            survivor.panel_type.clone(),
            survivor.terminal_id.clone(),
        )
    };

    let (mod_v1, mod_v2, mod_v3, mod_v4, edge1_v1, edge1_v2, edge2_v1, edge2_v2) = match adj {
        Adjacency::North => {
            // Absorbed is above survivor
            // survivor takes absorbed's top vertices
            (surv_v1.clone(), absorbed_v2.clone(), absorbed_v3.clone(), surv_v4.clone(),
             surv_v1.clone(), absorbed_v2.clone(),  // new left edge
             absorbed_v3.clone(), surv_v4.clone())   // new right edge
        }
        Adjacency::South => {
            // Absorbed is below survivor
            // survivor takes absorbed's bottom vertices
            (absorbed_v1.clone(), surv_v2.clone(), surv_v3.clone(), absorbed_v4.clone(),
             absorbed_v1.clone(), surv_v2.clone(),  // new left edge
             surv_v3.clone(), absorbed_v4.clone())   // new right edge
        }
        Adjacency::East => {
            // Absorbed is right of survivor
            // survivor takes absorbed's right vertices
            (surv_v1.clone(), surv_v2.clone(), absorbed_v3.clone(), absorbed_v4.clone(),
             surv_v2.clone(), absorbed_v3.clone(),  // new top edge
             absorbed_v4.clone(), surv_v1.clone())   // new bottom edge
        }
        Adjacency::West => {
            // Absorbed is left of survivor
            // survivor takes absorbed's left vertices
            (absorbed_v1.clone(), absorbed_v2.clone(), surv_v3.clone(), surv_v4.clone(),
             absorbed_v2.clone(), surv_v3.clone(),  // new top edge
             surv_v4.clone(), absorbed_v1.clone())   // new bottom edge
        }
    };

    // Update survivor
    if let Some(surv) = screen.get_area_mut(survivor_id) {
        surv.v1 = mod_v1;
        surv.v2 = mod_v2;
        surv.v3 = mod_v3;
        surv.v4 = mod_v4;
        surv.panel_type = surv_panel_type;
        surv.terminal_id = surv_terminal_id;
    }

    // Add the two new boundary edges
    screen.edges.push(Edge {
        id: Uuid::new_v4().to_string(),
        v1: edge1_v1,
        v2: edge1_v2,
        border: false,
    });
    screen.edges.push(Edge {
        id: Uuid::new_v4().to_string(),
        v1: edge2_v1,
        v2: edge2_v2,
        border: false,
    });

    // Remove absorbed area
    screen.areas.retain(|a| a.id != absorbed_id);

    cleanup(screen);

    Ok(())
}

pub fn screen_area_close(screen: &mut Screen, area_id: &str) -> Result<(), String> {
    if screen.areas.len() <= 1 {
        return Err("Cannot close the last area".to_string());
    }

    let (area_left, area_bottom, area_right, area_top) = {
        let area = screen.get_area(area_id).ok_or_else(|| "Area not found".to_string())?;
        area_bounds(screen, area).ok_or_else(|| "Cannot compute area bounds".to_string())?
    };
    let area_w = area_right - area_left;
    let area_h = area_top - area_bottom;

    let mut best_neighbor: Option<String> = None;
    let mut best_score: f64 = -1.0;

    for other in &screen.areas {
        if other.id == area_id {
            continue;
        }
        if let Some(adj) = get_adjacency(screen, area_id, &other.id) {
            let (other_left, other_bottom, other_right, other_top) = match area_bounds(screen, other) {
                Some(b) => b,
                None => continue,
            };
            let other_w = other_right - other_left;
            let other_h = other_top - other_bottom;

            let score = match adj {
                Adjacency::North | Adjacency::South => {
                    let shared = area_w.min(other_w);
                    let total = area_w.max(other_w);
                    if total <= EPSILON { 0.0 } else { shared / total }
                }
                Adjacency::East | Adjacency::West => {
                    let shared = area_h.min(other_h);
                    let total = area_h.max(other_h);
                    if total <= EPSILON { 0.0 } else { shared / total }
                }
            };

            if score > best_score {
                best_score = score;
                best_neighbor = Some(other.id.clone());
            }
        }
    }

    match best_neighbor {
        Some(neighbor_id) => screen_area_join(screen, &neighbor_id, area_id),
        None => Err("No adjacent neighbor found".to_string()),
    }
}

pub fn resize_edge(screen: &mut Screen, edge_id: &str, new_pos: f64) -> Result<(), String> {
    let (is_horizontal, is_vertical) = {
        let edge = screen.get_edge(edge_id).ok_or_else(|| "Edge not found".to_string())?;
        (is_edge_horizontal(screen, edge), is_edge_vertical(screen, edge))
    };
    if !is_horizontal && !is_vertical {
        return Err("Edge is not axis-aligned".to_string());
    }

    let selected_vec = select_connected_vertices(screen, edge_id);
    if selected_vec.is_empty() {
        return Err("No connected vertices".to_string());
    }
    let selected: HashSet<String> = selected_vec.into_iter().collect();

    let current_pos = if is_horizontal {
        // Get y from any selected vertex
        let vid = selected.iter().next().ok_or("No selected vertices")?;
        screen.get_vertex(vid).ok_or("Missing vertex")?.y
    } else {
        let vid = selected.iter().next().ok_or("No selected vertices")?;
        screen.get_vertex(vid).ok_or("Missing vertex")?.x
    };

    let mut bigger = f64::MAX;
    let mut smaller = f64::MAX;

    for area in &screen.areas {
        if is_horizontal {
            let h = area_height(screen, area).ok_or("Cannot compute area height")?;
            let free_space = h - MIN_AREA_SIZE;

            // BOTTOM edge vertices (v1 AND v4) selected → area is ABOVE edge
            if selected.contains(&area.v1) && selected.contains(&area.v4) {
                bigger = bigger.min(free_space);
            }
            // TOP edge vertices (v2 AND v3) selected → area is BELOW edge
            if selected.contains(&area.v2) && selected.contains(&area.v3) {
                smaller = smaller.min(free_space);
            }
        } else {
            let w = area_width(screen, area).ok_or("Cannot compute area width")?;
            let free_space = w - MIN_AREA_SIZE;

            // LEFT edge vertices (v1 AND v2) selected → area is to the RIGHT
            if selected.contains(&area.v1) && selected.contains(&area.v2) {
                bigger = bigger.min(free_space);
            }
            // RIGHT edge vertices (v3 AND v4) selected → area is to the LEFT
            if selected.contains(&area.v3) && selected.contains(&area.v4) {
                smaller = smaller.min(free_space);
            }
        }
    }

    let clamped_pos = new_pos.max(current_pos - smaller).min(current_pos + bigger);

    for vid in &selected {
        if let Some(v) = screen.get_vertex_mut(vid) {
            if is_horizontal {
                v.y = clamped_pos;
            } else {
                v.x = clamped_pos;
            }
        }
    }

    Ok(())
}

pub fn change_panel_type(screen: &mut Screen, area_id: &str, new_panel_type: &str) -> Result<(), String> {
    let area = screen.get_area_mut(area_id).ok_or_else(|| "Area not found".to_string())?;
    area.panel_type = new_panel_type.to_string();
    if new_panel_type != "terminal" {
        area.terminal_id = None;
    }
    Ok(())
}

pub fn convert_tree_to_screen(tree: &LayoutTree) -> Screen {
    let mut screen = Screen::new();
    let initial_area_id = screen.areas[0].id.clone();
    convert_node(&mut screen, &initial_area_id, &tree.tree);
    screen
}

fn convert_node(screen: &mut Screen, area_id: &str, node: &LayoutNode) {
    match node {
        LayoutNode::Panel { panel_type, terminal_id } => {
            if let Some(area) = screen.get_area_mut(area_id) {
                area.panel_type = panel_type.clone();
                area.terminal_id = terminal_id.clone();
            }
        }
        LayoutNode::Split { direction, ratio, children } => {
            let axis = match direction {
                Direction::Vertical => Axis::Vertical,
                Direction::Horizontal => Axis::Horizontal,
            };

            let new_area_id = area_split(screen, area_id, axis, *ratio)
                .expect("area_split failed during tree conversion");

            match (direction, *ratio > 0.5) {
                (Direction::Vertical, true) => {
                    convert_node(screen, area_id, &children[0]);
                    convert_node(screen, &new_area_id, &children[1]);
                }
                (Direction::Vertical, false) => {
                    convert_node(screen, &new_area_id, &children[0]);
                    convert_node(screen, area_id, &children[1]);
                }
                (Direction::Horizontal, true) => {
                    convert_node(screen, &new_area_id, &children[0]);
                    convert_node(screen, area_id, &children[1]);
                }
                (Direction::Horizontal, false) => {
                    convert_node(screen, area_id, &children[0]);
                    convert_node(screen, &new_area_id, &children[1]);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::screen::{Screen, Vertex, Edge, Area, EPSILON, MIN_AREA_SIZE};
    use crate::domain::{Direction, LayoutNode, LayoutTree};

    fn make_two_area_screen() -> Screen {
        Screen {
            vertices: vec![
                Vertex { id: "bl".into(), x: 0.0, y: 0.0 },
                Vertex { id: "tl".into(), x: 0.0, y: 1.0 },
                Vertex { id: "mb".into(), x: 0.5, y: 0.0 },
                Vertex { id: "mt".into(), x: 0.5, y: 1.0 },
                Vertex { id: "br".into(), x: 1.0, y: 0.0 },
                Vertex { id: "tr".into(), x: 1.0, y: 1.0 },
            ],
            edges: vec![
                Edge { id: "e_left".into(), v1: "bl".into(), v2: "tl".into(), border: true },
                Edge { id: "e_topl".into(), v1: "tl".into(), v2: "mt".into(), border: true },
                Edge { id: "e_topr".into(), v1: "mt".into(), v2: "tr".into(), border: true },
                Edge { id: "e_right".into(), v1: "tr".into(), v2: "br".into(), border: true },
                Edge { id: "e_botr".into(), v1: "br".into(), v2: "mb".into(), border: true },
                Edge { id: "e_botl".into(), v1: "mb".into(), v2: "bl".into(), border: true },
                Edge { id: "e_mid".into(), v1: "mt".into(), v2: "mb".into(), border: false },
            ],
            areas: vec![
                Area {
                    id: "a_left".into(),
                    v1: "bl".into(), v2: "tl".into(), v3: "mt".into(), v4: "mb".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
                Area {
                    id: "a_right".into(),
                    v1: "mb".into(), v2: "mt".into(), v3: "tr".into(), v4: "br".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
            ],
        }
    }

    fn make_t_junction_screen() -> Screen {
        Screen {
            vertices: vec![
                Vertex { id: "v0".into(), x: 0.0, y: 1.0 },
                Vertex { id: "v1".into(), x: 0.5, y: 1.0 },
                Vertex { id: "v2".into(), x: 1.0, y: 1.0 },
                Vertex { id: "v3".into(), x: 0.0, y: 0.5 },
                Vertex { id: "v4".into(), x: 0.5, y: 0.5 },
                Vertex { id: "v5".into(), x: 1.0, y: 0.5 },
                Vertex { id: "v6".into(), x: 0.0, y: 0.0 },
                Vertex { id: "v7".into(), x: 1.0, y: 0.0 },
            ],
            edges: vec![
                Edge { id: "e_topl".into(), v1: "v0".into(), v2: "v1".into(), border: true },
                Edge { id: "e_topr".into(), v1: "v1".into(), v2: "v2".into(), border: true },
                Edge { id: "e_rightt".into(), v1: "v2".into(), v2: "v5".into(), border: true },
                Edge { id: "e_rightb".into(), v1: "v5".into(), v2: "v7".into(), border: true },
                Edge { id: "e_bot".into(), v1: "v7".into(), v2: "v6".into(), border: true },
                Edge { id: "e_leftb".into(), v1: "v6".into(), v2: "v3".into(), border: true },
                Edge { id: "e_leftt".into(), v1: "v3".into(), v2: "v0".into(), border: true },
                Edge { id: "e_vert".into(), v1: "v1".into(), v2: "v4".into(), border: false },
                Edge { id: "e_horizl".into(), v1: "v3".into(), v2: "v4".into(), border: false },
                Edge { id: "e_horizr".into(), v1: "v4".into(), v2: "v5".into(), border: false },
            ],
            areas: vec![
                Area {
                    id: "a_a".into(),
                    v1: "v3".into(), v2: "v0".into(), v3: "v1".into(), v4: "v4".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
                Area {
                    id: "a_b".into(),
                    v1: "v4".into(), v2: "v1".into(), v3: "v2".into(), v4: "v5".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
                Area {
                    id: "a_c".into(),
                    v1: "v6".into(), v2: "v3".into(), v3: "v5".into(), v4: "v7".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
            ],
        }
    }

    fn make_horizontal_split_screen() -> Screen {
        Screen {
            vertices: vec![
                Vertex { id: "h_bl".into(), x: 0.0, y: 0.0 },
                Vertex { id: "h_tl".into(), x: 0.0, y: 0.5 },
                Vertex { id: "h_tr".into(), x: 1.0, y: 0.5 },
                Vertex { id: "h_br".into(), x: 1.0, y: 0.0 },
                Vertex { id: "h_tl2".into(), x: 0.0, y: 1.0 },
                Vertex { id: "h_tr2".into(), x: 1.0, y: 1.0 },
            ],
            edges: vec![
                Edge { id: "h_e_left".into(), v1: "h_bl".into(), v2: "h_tl".into(), border: true },
                Edge { id: "h_e_mid".into(), v1: "h_tl".into(), v2: "h_tr".into(), border: false },
                Edge { id: "h_e_right".into(), v1: "h_tr".into(), v2: "h_br".into(), border: true },
                Edge { id: "h_e_bot".into(), v1: "h_br".into(), v2: "h_bl".into(), border: true },
                Edge { id: "h_e_left2".into(), v1: "h_tl".into(), v2: "h_tl2".into(), border: true },
                Edge { id: "h_e_top".into(), v1: "h_tl2".into(), v2: "h_tr2".into(), border: true },
                Edge { id: "h_e_right2".into(), v1: "h_tr2".into(), v2: "h_tr".into(), border: true },
            ],
            areas: vec![
                Area {
                    id: "a_bottom".into(),
                    v1: "h_bl".into(), v2: "h_tl".into(), v3: "h_tr".into(), v4: "h_br".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
                Area {
                    id: "a_top".into(),
                    v1: "h_tl".into(), v2: "h_tl2".into(), v3: "h_tr2".into(), v4: "h_tr".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
            ],
        }
    }

    #[test]
    fn test_find_edge() {
        let screen = make_two_area_screen();
        assert!(find_edge(&screen, "mt", "mb").is_some());
        assert!(find_edge(&screen, "mb", "mt").is_some());
        assert_eq!(find_edge(&screen, "mt", "mb").unwrap().id, "e_mid");
        assert!(find_edge(&screen, "nonexistent", "mt").is_none());
    }

    #[test]
    fn test_find_area_at_point() {
        let screen = make_two_area_screen();
        let area = find_area_at_point(&screen, 0.25, 0.5);
        assert!(area.is_some());
        assert_eq!(area.unwrap().id, "a_left");

        let area = find_area_at_point(&screen, 0.75, 0.5);
        assert!(area.is_some());
        assert_eq!(area.unwrap().id, "a_right");
    }

    #[test]
    fn test_find_area_at_point_center() {
        let screen = Screen::new();
        let area = find_area_at_point(&screen, 0.5, 0.5);
        assert!(area.is_some());
        assert_eq!(area.unwrap().panel_type, "blank");
    }

    #[test]
    fn test_find_area_at_point_none() {
        let screen = Screen::new();
        assert!(find_area_at_point(&screen, 2.0, 2.0).is_none());
        assert!(find_area_at_point(&screen, -0.1, 0.5).is_none());
    }

    #[test]
    fn test_find_active_edge() {
        let screen = make_two_area_screen();
        let edge = find_active_edge(&screen, 0.5, 0.5, 0.1);
        assert!(edge.is_some());
        assert_eq!(edge.unwrap().id, "e_mid");
    }

    #[test]
    fn test_find_active_edge_outside_tolerance() {
        let screen = make_two_area_screen();
        let edge = find_active_edge(&screen, 2.0, 0.5, 0.1);
        assert!(edge.is_none());
    }

    #[test]
    fn test_find_active_edge_ignores_border() {
        let screen = Screen::new();
        assert!(find_active_edge(&screen, 0.5, 0.5, 0.1).is_none());
    }

    #[test]
    fn test_is_edge_horizontal() {
        let screen = make_two_area_screen();
        let top_edge = screen.edges.iter().find(|e| e.id == "e_topl").unwrap();
        let mid_edge = screen.edges.iter().find(|e| e.id == "e_mid").unwrap();
        assert!(is_edge_horizontal(&screen, top_edge));
        assert!(!is_edge_horizontal(&screen, mid_edge));
    }

    #[test]
    fn test_is_edge_vertical() {
        let screen = make_two_area_screen();
        let left_edge = screen.edges.iter().find(|e| e.id == "e_left").unwrap();
        let top_edge = screen.edges.iter().find(|e| e.id == "e_topl").unwrap();
        assert!(is_edge_vertical(&screen, left_edge));
        assert!(!is_edge_vertical(&screen, top_edge));
    }

    #[test]
    fn test_area_bounds() {
        let screen = make_two_area_screen();
        let area = screen.areas.iter().find(|a| a.id == "a_left").unwrap();
        let bounds = area_bounds(&screen, area).unwrap();
        assert!((bounds.0 - 0.0).abs() < EPSILON);
        assert!((bounds.1 - 0.0).abs() < EPSILON);
        assert!((bounds.2 - 0.5).abs() < EPSILON);
        assert!((bounds.3 - 1.0).abs() < EPSILON);
    }

    #[test]
    fn test_area_bounds_missing_vertex() {
        let screen = Screen::new();
        let mut screen = screen;
        screen.vertices.clear();
        let area = Area {
            id: "test".into(),
            v1: "missing".into(), v2: "missing".into(), v3: "missing".into(), v4: "missing".into(),
            panel_type: "blank".into(), terminal_id: None,
        };
        assert!(area_bounds(&screen, &area).is_none());
    }

    #[test]
    fn test_area_width_height() {
        let screen = make_two_area_screen();
        let area = screen.areas.iter().find(|a| a.id == "a_left").unwrap();
        let w = area_width(&screen, area).unwrap();
        let h = area_height(&screen, area).unwrap();
        assert!((w - 0.5).abs() < EPSILON);
        assert!((h - 1.0).abs() < EPSILON);
    }

    #[test]
    fn test_get_adjacency_east_west() {
        let screen = make_two_area_screen();
        assert_eq!(get_adjacency(&screen, "a_left", "a_right"), Some(Adjacency::East));
        assert_eq!(get_adjacency(&screen, "a_right", "a_left"), Some(Adjacency::West));
    }

    #[test]
    fn test_get_adjacency_north_south() {
        let screen = make_horizontal_split_screen();
        assert_eq!(get_adjacency(&screen, "a_bottom", "a_top"), Some(Adjacency::North));
        assert_eq!(get_adjacency(&screen, "a_top", "a_bottom"), Some(Adjacency::South));
    }

    #[test]
    fn test_get_adjacency_none() {
        let screen = Screen::new();
        assert!(get_adjacency(&screen, "nonexistent", "other").is_none());
    }

    #[test]
    fn test_get_adjacency_t_junction() {
        let screen = make_t_junction_screen();
        assert_eq!(get_adjacency(&screen, "a_a", "a_c"), Some(Adjacency::South));
        assert_eq!(get_adjacency(&screen, "a_c", "a_a"), Some(Adjacency::North));
        assert_eq!(get_adjacency(&screen, "a_a", "a_b"), Some(Adjacency::East));
        assert_eq!(get_adjacency(&screen, "a_b", "a_a"), Some(Adjacency::West));
        assert_eq!(get_adjacency(&screen, "a_b", "a_c"), Some(Adjacency::South));
        assert_eq!(get_adjacency(&screen, "a_c", "a_b"), Some(Adjacency::North));
    }

    #[test]
    fn test_select_connected_vertices_two_areas() {
        let screen = make_two_area_screen();
        let result = select_connected_vertices(&screen, "e_mid");
        assert_eq!(result.len(), 2);
        assert!(result.contains(&"mt".to_string()));
        assert!(result.contains(&"mb".to_string()));
    }

    #[test]
    fn test_select_connected_vertices_t_junction_vertical() {
        let screen = make_t_junction_screen();
        let result = select_connected_vertices(&screen, "e_vert");
        assert_eq!(result.len(), 2);
        assert!(result.contains(&"v1".to_string()));
        assert!(result.contains(&"v4".to_string()));
    }

    #[test]
    fn test_select_connected_vertices_t_junction_horizontal() {
        let screen = make_t_junction_screen();
        let result = select_connected_vertices(&screen, "e_horizl");
        assert_eq!(result.len(), 3);
        assert!(result.contains(&"v3".to_string()));
        assert!(result.contains(&"v4".to_string()));
        assert!(result.contains(&"v5".to_string()));
    }

    #[test]
    fn test_select_connected_vertices_nonexistent() {
        let screen = Screen::new();
        let result = select_connected_vertices(&screen, "nonexistent");
        assert!(result.is_empty());
    }

    #[test]
    fn test_remove_duplicate_edges() {
        let mut screen = make_two_area_screen();
        screen.edges.push(Edge {
            id: "dup".into(),
            v1: "mt".into(), v2: "mb".into(),
            border: false,
        });
        assert_eq!(screen.edges.len(), 8);
        remove_duplicate_edges(&mut screen);
        assert_eq!(screen.edges.len(), 7);
    }

    #[test]
    fn test_remove_unused_edges() {
        let mut screen = make_two_area_screen();
        screen.edges.push(Edge {
            id: "orphan".into(),
            v1: "bl".into(), v2: "tr".into(),
            border: false,
        });
        assert_eq!(screen.edges.len(), 8);
        remove_unused_edges(&mut screen);
        assert_eq!(screen.edges.len(), 7);
        assert!(screen.edges.iter().any(|e| e.id == "e_mid"));
        assert!(screen.edges.iter().all(|e| e.id != "orphan"));
    }

    #[test]
    fn test_remove_unused_vertices() {
        let mut screen = make_two_area_screen();
        screen.vertices.push(Vertex {
            id: "orphan_v".into(), x: 0.9, y: 0.9,
        });
        assert_eq!(screen.vertices.len(), 7);
        remove_unused_vertices(&mut screen);
        assert_eq!(screen.vertices.len(), 6);
        assert!(screen.vertices.iter().all(|v| v.id != "orphan_v"));
    }

    #[test]
    fn test_remove_duplicate_vertices() {
        let mut screen = make_two_area_screen();
        screen.vertices.push(Vertex {
            id: "dup_bl".into(), x: 0.0, y: 0.0,
        });
        screen.edges.push(Edge {
            id: "edge_to_dup".into(),
            v1: "dup_bl".into(), v2: "tl".into(),
            border: false,
        });
        assert_eq!(screen.vertices.len(), 7);
        // After merging, dup_bl is replaced by bl. The edge becomes "bl"-"tl" which
        // duplicates "e_left", so it gets removed by remove_duplicate_edges.
        // The vertex count goes from 7 to 6 (dup_bl removed).
        remove_duplicate_vertices(&mut screen);
        assert_eq!(screen.vertices.len(), 6);
        // The duplicate edge was removed; the original "e_left" edge remains
        assert!(screen.edges.iter().any(|e| e.id == "e_left"));
        assert!(screen.edges.iter().all(|e| e.id != "edge_to_dup"));
    }

    #[test]
    fn test_remove_duplicate_vertices_no_duplicates() {
        let mut screen = make_two_area_screen();
        let count = screen.vertices.len();
        remove_duplicate_vertices(&mut screen);
        assert_eq!(screen.vertices.len(), count);
    }

    #[test]
    fn test_cleanup() {
        let mut screen = make_two_area_screen();
        screen.vertices.push(Vertex { id: "orphan_v".into(), x: 0.9, y: 0.9 });
        screen.edges.push(Edge { id: "orphan_e".into(), v1: "bl".into(), v2: "tr".into(), border: false });
        screen.edges.push(Edge { id: "dup_e".into(), v1: "mt".into(), v2: "mb".into(), border: false });
        screen.vertices.push(Vertex { id: "dup_v".into(), x: 0.0, y: 0.0 });
        cleanup(&mut screen);
        assert_eq!(screen.vertices.len(), 6);
        assert_eq!(screen.edges.len(), 7);
    }

    #[test]
    fn test_validate_screen_valid() {
        let screen = make_two_area_screen();
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_validate_screen_valid_default() {
        let screen = Screen::new();
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_validate_screen_valid_t_junction() {
        let screen = make_t_junction_screen();
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_validate_screen_missing_vertex_in_area() {
        let mut screen = make_two_area_screen();
        screen.areas[0].v1 = "nonexistent".to_string();
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("missing vertex"));
    }

    #[test]
    fn test_validate_screen_missing_vertex_in_edge() {
        let mut screen = make_two_area_screen();
        screen.edges[0].v1 = "nonexistent".to_string();
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("missing vertex"));
    }

    #[test]
    fn test_validate_screen_non_rectangle() {
        let mut screen = make_two_area_screen();
        let v = screen.vertices.iter_mut().find(|v| v.id == "tl").unwrap();
        v.x = 0.1;
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("not a rectangle"));
    }

    #[test]
    fn test_validate_screen_duplicate_vertex() {
        let mut screen = make_two_area_screen();
        screen.vertices.push(Vertex { id: "dup".into(), x: 0.0, y: 0.0 });
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("Duplicate vertex"));
    }

    #[test]
    fn test_validate_screen_orphan_edge() {
        let mut screen = make_two_area_screen();
        // "bl" (0,0) to "br" (1,0) is a horizontal edge not referenced by any area
        screen.edges.push(Edge { id: "orphan".into(), v1: "bl".into(), v2: "br".into(), border: false });
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("Orphan edge"));
    }

    #[test]
    fn test_validate_screen_orphan_vertex() {
        let mut screen = make_two_area_screen();
        screen.vertices.push(Vertex { id: "orphan".into(), x: 0.9, y: 0.9 });
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("Orphan vertex"));
    }

    #[test]
    fn test_validate_screen_too_small_area() {
        let screen = Screen {
            vertices: vec![
                Vertex { id: "v1".into(), x: 0.0, y: 0.0 },
                Vertex { id: "v2".into(), x: 0.0, y: MIN_AREA_SIZE * 0.5 },
                Vertex { id: "v3".into(), x: MIN_AREA_SIZE * 0.5, y: MIN_AREA_SIZE * 0.5 },
                Vertex { id: "v4".into(), x: MIN_AREA_SIZE * 0.5, y: 0.0 },
            ],
            edges: vec![
                Edge { id: "e1".into(), v1: "v1".into(), v2: "v2".into(), border: true },
                Edge { id: "e2".into(), v1: "v2".into(), v2: "v3".into(), border: true },
                Edge { id: "e3".into(), v1: "v3".into(), v2: "v4".into(), border: true },
                Edge { id: "e4".into(), v1: "v4".into(), v2: "v1".into(), border: true },
            ],
            areas: vec![
                Area {
                    id: "small".into(),
                    v1: "v1".into(), v2: "v2".into(), v3: "v3".into(), v4: "v4".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
            ],
        };
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("below minimum"));
    }

    #[test]
    fn test_validate_screen_non_axis_aligned_edge() {
        let screen = Screen {
            vertices: vec![
                Vertex { id: "v1".into(), x: 0.0, y: 0.0 },
                Vertex { id: "v2".into(), x: 1.0, y: 1.0 },
                Vertex { id: "v3".into(), x: 0.0, y: 1.0 },
                Vertex { id: "v4".into(), x: 1.0, y: 0.0 },
            ],
            edges: vec![
                Edge { id: "e1".into(), v1: "v1".into(), v2: "v2".into(), border: false },
                Edge { id: "e2".into(), v1: "v1".into(), v2: "v3".into(), border: true },
                Edge { id: "e3".into(), v1: "v3".into(), v2: "v2".into(), border: true },
                Edge { id: "e4".into(), v1: "v2".into(), v2: "v4".into(), border: true },
                Edge { id: "e5".into(), v1: "v4".into(), v2: "v1".into(), border: true },
            ],
            areas: vec![
                Area {
                    id: "a1".into(),
                    v1: "v1".into(), v2: "v3".into(), v3: "v2".into(), v4: "v4".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
            ],
        };
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("not axis-aligned"));
    }

    #[test]
    fn test_validate_screen_duplicate_edge() {
        let mut screen = make_two_area_screen();
        screen.edges.push(Edge {
            id: "dup".into(),
            v1: "mt".into(), v2: "mb".into(),
            border: false,
        });
        assert!(validate_screen(&screen).is_err());
        assert!(validate_screen(&screen).unwrap_err().contains("Duplicate edge"));
    }

    // ----- area_split tests -----

    #[test]
    fn test_area_split_vertical() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        let new_id = area_split(&mut screen, &area_id, Axis::Vertical, 0.3).unwrap();
        assert_eq!(screen.areas.len(), 2);
        assert_eq!(screen.vertices.len(), 6);
        // new area is on left (factor <= 0.5), original on right
        let new_area = screen.get_area(&new_id).unwrap();
        let orig_area = screen.get_area(&area_id).unwrap();
        let (nl, nb, nr, nt) = area_bounds(&screen, new_area).unwrap();
        let (ol, ob, or_, ot) = area_bounds(&screen, orig_area).unwrap();
        // new area left side
        assert!((nl - 0.0).abs() < EPSILON);
        assert!((nr - 0.3).abs() < EPSILON);
        // original right side
        assert!((ol - 0.3).abs() < EPSILON);
        assert!((or_ - 1.0).abs() < EPSILON);
        // heights should be full
        assert!((nt - nb - 1.0).abs() < EPSILON);
        assert!((ot - ob - 1.0).abs() < EPSILON);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_area_split_horizontal() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        let new_id = area_split(&mut screen, &area_id, Axis::Horizontal, 0.7).unwrap();
        assert_eq!(screen.areas.len(), 2);
        assert_eq!(screen.vertices.len(), 6);
        // new area is on top (factor > 0.5), original on bottom
        let new_area = screen.get_area(&new_id).unwrap();
        let orig_area = screen.get_area(&area_id).unwrap();
        let (_, nb, _, nt) = area_bounds(&screen, new_area).unwrap();
        let (_, ob, _, ot) = area_bounds(&screen, orig_area).unwrap();
        // original bottom, new top
        assert!((ob - 0.0).abs() < EPSILON);
        assert!((ot - 0.7).abs() < EPSILON);
        assert!((nb - 0.7).abs() < EPSILON);
        assert!((nt - 1.0).abs() < EPSILON);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_area_split_too_small() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        // Split at 0.5, then try to split one of the halves at 0.5 — should work
        let _ = area_split(&mut screen, &area_id, Axis::Vertical, 0.5).unwrap();
        // Find the smaller half
        let small_id = screen.areas[1].id.clone();
        // This area is 0.5 wide, so splitting at 0.001 would try to make a 0.0005 wide area
        // But MIN_AREA_SIZE is 0.05, so a 0.5 wide area can be split at most into 0.05 and 0.45
        // total_w = 0.5, 2*MIN_AREA_SIZE = 0.1, so it should be splittable
        let result = area_split(&mut screen, &small_id, Axis::Vertical, 0.001);
        assert!(result.is_ok());
        // Now try to split a very small area
        // Make a tiny area manually
        let tiny_screen = Screen {
            vertices: vec![
                Vertex { id: "v1".into(), x: 0.0, y: 0.0 },
                Vertex { id: "v2".into(), x: 0.0, y: MIN_AREA_SIZE * 0.5 },
                Vertex { id: "v3".into(), x: MIN_AREA_SIZE * 0.5, y: MIN_AREA_SIZE * 0.5 },
                Vertex { id: "v4".into(), x: MIN_AREA_SIZE * 0.5, y: 0.0 },
            ],
            edges: vec![
                Edge { id: "e1".into(), v1: "v1".into(), v2: "v2".into(), border: true },
                Edge { id: "e2".into(), v1: "v2".into(), v2: "v3".into(), border: true },
                Edge { id: "e3".into(), v1: "v3".into(), v2: "v4".into(), border: true },
                Edge { id: "e4".into(), v1: "v4".into(), v2: "v1".into(), border: true },
            ],
            areas: vec![
                Area {
                    id: "tiny".into(),
                    v1: "v1".into(), v2: "v2".into(), v3: "v3".into(), v4: "v4".into(),
                    panel_type: "blank".into(), terminal_id: None,
                },
            ],
        };
        let mut tiny_screen = tiny_screen;
        let result = area_split(&mut tiny_screen, "tiny", Axis::Horizontal, 0.5);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too small"));
    }

    #[test]
    fn test_area_split_preserves_panel_type() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        change_panel_type(&mut screen, &area_id, "terminal").unwrap();
        // Set terminal_id on original
        if let Some(area) = screen.get_area_mut(&area_id) {
            area.terminal_id = Some("term-1".to_string());
        }
        let new_id = area_split(&mut screen, &area_id, Axis::Vertical, 0.5).unwrap();
        let orig = screen.get_area(&area_id).unwrap();
        let new = screen.get_area(&new_id).unwrap();
        assert_eq!(orig.panel_type, "terminal");
        assert_eq!(new.panel_type, "terminal");
        assert_eq!(orig.terminal_id, Some("term-1".to_string()));
        assert_eq!(new.terminal_id, None);
    }

    #[test]
    fn test_area_split_cleanup() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        area_split(&mut screen, &area_id, Axis::Vertical, 0.4).unwrap();
        assert!(validate_screen(&screen).is_ok());
        // No duplicate edges
        let edge_set: HashSet<_> = screen.edges.iter().map(|e| edge_signature(&e.v1, &e.v2)).collect();
        assert_eq!(edge_set.len(), screen.edges.len());
        // All vertices referenced by edges
        let verts_in_edges: HashSet<String> = screen.edges.iter().flat_map(|e| [e.v1.clone(), e.v2.clone()]).collect();
        for v in &screen.vertices {
            assert!(verts_in_edges.contains(&v.id), "Vertex {} is orphaned", v.id);
        }
    }

    // ----- Join tests -----

    #[test]
    fn test_screen_area_join_east() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        let new_id = area_split(&mut screen, &area_id, Axis::Vertical, 0.5).unwrap();
        assert_eq!(screen.areas.len(), 2);
        screen_area_join(&mut screen, &area_id, &new_id).unwrap();
        assert_eq!(screen.areas.len(), 1);
        let area = &screen.areas[0];
        let (l, b, r, t) = area_bounds(&screen, area).unwrap();
        assert!((l - 0.0).abs() < EPSILON);
        assert!((b - 0.0).abs() < EPSILON);
        assert!((r - 1.0).abs() < EPSILON);
        assert!((t - 1.0).abs() < EPSILON);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_screen_area_join_north() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        let new_id = area_split(&mut screen, &area_id, Axis::Horizontal, 0.5).unwrap();
        assert_eq!(screen.areas.len(), 2);
        screen_area_join(&mut screen, &area_id, &new_id).unwrap();
        assert_eq!(screen.areas.len(), 1);
        assert!(validate_screen(&screen).is_ok());
        let (l, b, r, t) = area_bounds(&screen, &screen.areas[0]).unwrap();
        assert!((l - 0.0).abs() < EPSILON);
        assert!((b - 0.0).abs() < EPSILON);
        assert!((r - 1.0).abs() < EPSILON);
        assert!((t - 1.0).abs() < EPSILON);
    }

    #[test]
    fn test_screen_area_join_not_adjacent() {
        let screen = make_t_junction_screen();
        let mut screen = screen;
        // a_a and a_b are adjacent (East/West), but a_a and a_c are also adjacent (North/South)
        // Let's try non-adjacent areas: there are none that are truly non-adjacent in a t-junction
        // Use a nonexistent ID
        let result = screen_area_join(&mut screen, "a_a", "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_screen_area_join_t_junction() {
        let mut screen = make_t_junction_screen();
        screen_area_join(&mut screen, "a_a", "a_b").unwrap();
        assert_eq!(screen.areas.len(), 2);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_screen_area_join_nonexistent() {
        let mut screen = Screen::new();
        let result = screen_area_join(&mut screen, "nonexistent", "other");
        assert!(result.is_err());
    }

    // ----- Close tests -----

    #[test]
    fn test_screen_area_close() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        let new_id = area_split(&mut screen, &area_id, Axis::Vertical, 0.5).unwrap();
        assert_eq!(screen.areas.len(), 2);
        screen_area_close(&mut screen, &new_id).unwrap();
        assert_eq!(screen.areas.len(), 1);
        let (l, b, r, t) = area_bounds(&screen, &screen.areas[0]).unwrap();
        assert!((l - 0.0).abs() < EPSILON);
        assert!((b - 0.0).abs() < EPSILON);
        assert!((r - 1.0).abs() < EPSILON);
        assert!((t - 1.0).abs() < EPSILON);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_screen_area_close_last() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        let result = screen_area_close(&mut screen, &area_id);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("last area"));
    }

    #[test]
    fn test_screen_area_close_t_junction() {
        let mut screen = make_t_junction_screen();
        screen_area_close(&mut screen, "a_a").unwrap();
        assert_eq!(screen.areas.len(), 2);
        assert!(validate_screen(&screen).is_ok());
    }

    // ----- Resize tests -----

    #[test]
    fn test_resize_edge_vertical() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        area_split(&mut screen, &area_id, Axis::Vertical, 0.5).unwrap();
        // Find the vertical divider edge — it should be non-border and between two split vertices
        // Since we split at 0.5, the divider goes from (0.5, 0) to (0.5, 1)
        let vert_edge_id = screen.edges.iter()
            .find(|e| !e.border && is_edge_vertical(&screen, e))
            .map(|e| e.id.clone())
            .unwrap();
        resize_edge(&mut screen, &vert_edge_id, 0.3).unwrap();
        // Find areas by position
        let left_area = screen.areas.iter()
            .find(|a| {
                let (l, _, _, _) = area_bounds(&screen, a).unwrap();
                (l - 0.0).abs() < EPSILON
            })
            .unwrap();
        let right_area = screen.areas.iter()
            .find(|a| {
                let (_, _, r, _) = area_bounds(&screen, a).unwrap();
                (r - 1.0).abs() < EPSILON
            })
            .unwrap();
        let (ll, _, lr, _) = area_bounds(&screen, left_area).unwrap();
        let (rl, _, rr, _) = area_bounds(&screen, right_area).unwrap();
        let lw = lr - ll;
        let rw = rr - rl;
        assert!((lw - 0.3).abs() < EPSILON, "Left width: {}", lw);
        assert!((rw - 0.7).abs() < EPSILON, "Right width: {}", rw);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_resize_edge_horizontal() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        area_split(&mut screen, &area_id, Axis::Horizontal, 0.5).unwrap();
        let horiz_edge_id = screen.edges.iter()
            .find(|e| !e.border && is_edge_horizontal(&screen, e))
            .map(|e| e.id.clone())
            .unwrap();
        resize_edge(&mut screen, &horiz_edge_id, 0.7).unwrap();
        // Find areas by position
        let bottom_area = screen.areas.iter()
            .find(|a| {
                let (_, b, _, _) = area_bounds(&screen, a).unwrap();
                (b - 0.0).abs() < EPSILON
            })
            .unwrap();
        let top_area = screen.areas.iter()
            .find(|a| {
                let (_, _, _, t) = area_bounds(&screen, a).unwrap();
                (t - 1.0).abs() < EPSILON
            })
            .unwrap();
        let (_, bb, _, bt) = area_bounds(&screen, bottom_area).unwrap();
        let (_, tb, _, tt) = area_bounds(&screen, top_area).unwrap();
        let bh = bt - bb;
        let th = tt - tb;
        assert!((bh - 0.7).abs() < EPSILON, "Bottom height: {}", bh);
        assert!((th - 0.3).abs() < EPSILON, "Top height: {}", th);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_resize_edge_clamped() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        area_split(&mut screen, &area_id, Axis::Vertical, 0.5).unwrap();
        let vert_edge_id = screen.edges.iter()
            .find(|e| !e.border && is_edge_vertical(&screen, e))
            .map(|e| e.id.clone())
            .unwrap();
        let current_x = screen.vertices.iter()
            .find(|v| screen.edges.iter().any(|e| e.id == vert_edge_id && (e.v1 == v.id || e.v2 == v.id)))
            .map(|v| v.x)
            .unwrap();
        // Try to resize to 0.99 — should be clamped to respect MIN_AREA_SIZE
        resize_edge(&mut screen, &vert_edge_id, 0.99).unwrap();
        // The clamped position should be 1.0 - MIN_AREA_SIZE = 0.95
        let new_x = screen.vertices.iter()
            .find(|v| screen.edges.iter().any(|e| e.id == vert_edge_id && (e.v1 == v.id || e.v2 == v.id)))
            .map(|v| v.x)
            .unwrap();
        assert!(new_x <= 1.0 - MIN_AREA_SIZE + EPSILON);
        assert!(new_x >= current_x);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_resize_edge_t_junction() {
        let mut screen = make_t_junction_screen();
        // Resize the horizontal edge (e_horizl or e_horizr)
        let horiz_id = "e_horizl";
        resize_edge(&mut screen, horiz_id, 0.3).unwrap();
        // All three horizontal vertices should be at y=0.3
        let v3 = screen.vertices.iter().find(|v| v.id == "v3").unwrap();
        let v4 = screen.vertices.iter().find(|v| v.id == "v4").unwrap();
        let v5 = screen.vertices.iter().find(|v| v.id == "v5").unwrap();
        assert!((v3.y - 0.3).abs() < EPSILON);
        assert!((v4.y - 0.3).abs() < EPSILON);
        assert!((v5.y - 0.3).abs() < EPSILON);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_resize_edge_nonexistent() {
        let mut screen = Screen::new();
        let result = resize_edge(&mut screen, "nonexistent", 0.5);
        assert!(result.is_err());
    }

    // ----- Change panel type tests -----

    #[test]
    fn test_change_panel_type() {
        let mut screen = Screen::new();
        let area_id = screen.areas[0].id.clone();
        // Change to terminal
        change_panel_type(&mut screen, &area_id, "terminal").unwrap();
        assert_eq!(screen.areas[0].panel_type, "terminal");
        // Set terminal_id
        screen.areas[0].terminal_id = Some("term-1".to_string());
        // Change to blank — should clear terminal_id
        change_panel_type(&mut screen, &area_id, "blank").unwrap();
        assert_eq!(screen.areas[0].panel_type, "blank");
        assert_eq!(screen.areas[0].terminal_id, None);
    }

    // ----- Migration tests -----

    #[test]
    fn test_convert_tree_single_panel() {
        let tree = LayoutTree {
            tree: LayoutNode::Panel {
                panel_type: "terminal".into(),
                terminal_id: Some("term-1".into()),
            },
        };
        let screen = convert_tree_to_screen(&tree);
        assert_eq!(screen.areas.len(), 1);
        assert_eq!(screen.areas[0].panel_type, "terminal");
        assert_eq!(screen.areas[0].terminal_id, Some("term-1".to_string()));
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_convert_tree_vertical_split() {
        let tree = LayoutTree {
            tree: LayoutNode::Split {
                direction: Direction::Vertical,
                ratio: 0.3,
                children: vec![
                    LayoutNode::Panel { panel_type: "editor".into(), terminal_id: None },
                    LayoutNode::Panel { panel_type: "terminal".into(), terminal_id: None },
                ],
            },
        };
        let screen = convert_tree_to_screen(&tree);
        assert_eq!(screen.areas.len(), 2);
        // Find areas by panel type
        let left = screen.areas.iter().find(|a| a.panel_type == "editor").unwrap();
        let right = screen.areas.iter().find(|a| a.panel_type == "terminal").unwrap();
        let (ll, _, lr, _) = area_bounds(&screen, left).unwrap();
        let (rl, _, rr, _) = area_bounds(&screen, right).unwrap();
        assert!((ll - 0.0).abs() < EPSILON);
        assert!((lr - 0.3).abs() < EPSILON);
        assert!((rl - 0.3).abs() < EPSILON);
        assert!((rr - 1.0).abs() < EPSILON);
        assert_eq!(left.panel_type, "editor");
        assert_eq!(right.panel_type, "terminal");
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_convert_tree_horizontal_split() {
        let tree = LayoutTree {
            tree: LayoutNode::Split {
                direction: Direction::Horizontal,
                ratio: 0.7,
                children: vec![
                    LayoutNode::Panel { panel_type: "terminal".into(), terminal_id: None },
                    LayoutNode::Panel { panel_type: "editor".into(), terminal_id: None },
                ],
            },
        };
        let screen = convert_tree_to_screen(&tree);
        assert_eq!(screen.areas.len(), 2);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_convert_tree_nested() {
        let tree = LayoutTree {
            tree: LayoutNode::Split {
                direction: Direction::Horizontal,
                ratio: 0.5,
                children: vec![
                    LayoutNode::Split {
                        direction: Direction::Vertical,
                        ratio: 0.5,
                        children: vec![
                            LayoutNode::Panel { panel_type: "editor".into(), terminal_id: None },
                            LayoutNode::Panel { panel_type: "terminal".into(), terminal_id: None },
                        ],
                    },
                    LayoutNode::Panel { panel_type: "blank".into(), terminal_id: None },
                ],
            },
        };
        let screen = convert_tree_to_screen(&tree);
        assert_eq!(screen.areas.len(), 3);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_convert_tree_deep() {
        let tree = LayoutTree {
            tree: LayoutNode::Split {
                direction: Direction::Vertical,
                ratio: 0.5,
                children: vec![
                    LayoutNode::Split {
                        direction: Direction::Horizontal,
                        ratio: 0.5,
                        children: vec![
                            LayoutNode::Split {
                                direction: Direction::Vertical,
                                ratio: 0.5,
                                children: vec![
                                    LayoutNode::Panel { panel_type: "a".into(), terminal_id: None },
                                    LayoutNode::Panel { panel_type: "b".into(), terminal_id: None },
                                ],
                            },
                            LayoutNode::Panel { panel_type: "c".into(), terminal_id: None },
                        ],
                    },
                    LayoutNode::Panel { panel_type: "d".into(), terminal_id: None },
                ],
            },
        };
        let screen = convert_tree_to_screen(&tree);
        assert_eq!(screen.areas.len(), 4);
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_convert_tree_preserves_terminal_ids() {
        let tree = LayoutTree {
            tree: LayoutNode::Split {
                direction: Direction::Vertical,
                ratio: 0.5,
                children: vec![
                    LayoutNode::Panel { panel_type: "terminal".into(), terminal_id: Some("term-a".into()) },
                    LayoutNode::Panel { panel_type: "terminal".into(), terminal_id: Some("term-b".into()) },
                ],
            },
        };
        let screen = convert_tree_to_screen(&tree);
        assert_eq!(screen.areas.len(), 2);
        let ids_with_terms: Vec<_> = screen.areas.iter()
            .filter(|a| a.terminal_id.is_some())
            .map(|a| a.terminal_id.as_deref().unwrap().to_string())
            .collect();
        assert!(ids_with_terms.contains(&"term-a".to_string()));
        assert!(ids_with_terms.contains(&"term-b".to_string()));
        assert!(validate_screen(&screen).is_ok());
    }

    #[test]
    fn test_convert_tree_complex() {
        // Layout:
        // +-------+-------+
        // |   A   |   B   |
        // +-------+-------+
        // |       C       |
        // +---------------+
        let tree = LayoutTree {
            tree: LayoutNode::Split {
                direction: Direction::Horizontal,
                ratio: 0.5,
                children: vec![
                    LayoutNode::Split {
                        direction: Direction::Vertical,
                        ratio: 0.5,
                        children: vec![
                            LayoutNode::Panel { panel_type: "A".into(), terminal_id: None },
                            LayoutNode::Panel { panel_type: "B".into(), terminal_id: None },
                        ],
                    },
                    LayoutNode::Panel { panel_type: "C".into(), terminal_id: None },
                ],
            },
        };
        let screen = convert_tree_to_screen(&tree);
        assert_eq!(screen.areas.len(), 3);
        assert!(validate_screen(&screen).is_ok());
        // Verify positions: there should be a T-junction-like layout
        // Top-left (A): left=0, bottom=0.5, right=0.5, top=1.0
        // Top-right (B): left=0.5, bottom=0.5, right=1.0, top=1.0
        // Bottom (C): left=0.0, bottom=0.0, right=1.0, top=0.5
        let a = screen.areas.iter().find(|a| a.panel_type == "A").unwrap();
        let b = screen.areas.iter().find(|a| a.panel_type == "B").unwrap();
        let c = screen.areas.iter().find(|a| a.panel_type == "C").unwrap();
        let (al, ab, ar, at) = area_bounds(&screen, a).unwrap();
        let (bl, bb, br, bt) = area_bounds(&screen, b).unwrap();
        let (cl, cb, cr, ct) = area_bounds(&screen, c).unwrap();
        assert!((al - 0.0).abs() < EPSILON);
        assert!((ab - 0.5).abs() < EPSILON);
        assert!((ar - 0.5).abs() < EPSILON);
        assert!((at - 1.0).abs() < EPSILON);
        assert!((bl - 0.5).abs() < EPSILON);
        assert!((bb - 0.5).abs() < EPSILON);
        assert!((br - 1.0).abs() < EPSILON);
        assert!((bt - 1.0).abs() < EPSILON);
        assert!((cl - 0.0).abs() < EPSILON);
        assert!((cb - 0.0).abs() < EPSILON);
        assert!((cr - 1.0).abs() < EPSILON);
        assert!((ct - 0.5).abs() < EPSILON);
    }
}
