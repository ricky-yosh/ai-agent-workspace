#[cfg(test)]
pub use crate::database::Database;

#[cfg(test)]
pub fn setup_db() -> Database {
    Database::new(":memory:".into())
}

#[cfg(test)]
pub fn create_test_canvas(db: &Database) -> (String, String) {
    let conn = db.connection().unwrap();
    let sessions = db.sessions(&conn);
    let session = sessions.create("/tmp", "Test").unwrap();
    let canvases = db.visual_canvases(&conn);
    let canvas = canvases.create(&session.id, "Test Canvas").unwrap();
    (session.id, canvas.id)
}

#[cfg(test)]
pub fn create_test_canvas_with_nodes(db: &Database) -> (String, String, String, String) {
    let conn = db.connection().unwrap();
    let sessions = db.sessions(&conn);
    let session = sessions.create("/tmp", "Test").unwrap();
    let canvases = db.visual_canvases(&conn);
    let canvas = canvases.create(&session.id, "Test Canvas").unwrap();
    let nodes = db.canvas_nodes(&conn);
    let node1 = nodes.create(&canvas.id, "Node 1", "", 0.0, 0.0, 100.0, 50.0, None).unwrap();
    let node2 = nodes.create(&canvas.id, "Node 2", "", 200.0, 200.0, 100.0, 50.0, None).unwrap();
    (session.id, canvas.id, node1.id, node2.id)
}

#[cfg(test)]
pub fn create_test_node(db: &Database, canvas_id: &str) -> String {
    let conn = db.connection().unwrap();
    let nodes = db.canvas_nodes(&conn);
    let node = nodes.create(canvas_id, "Test Node", "", 0.0, 0.0, 100.0, 50.0, None).unwrap();
    node.id
}
