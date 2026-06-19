use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{Layout, Screen};

fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub struct LayoutRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> LayoutRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        LayoutRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn list(&self) -> Result<Vec<Layout>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, tree, built_in FROM layouts ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            let tree_json: String = row.get(2)?;
            let screen: Screen = serde_json::from_str(&tree_json)
                .unwrap_or_else(|_| Screen::default());
            let built_in: i32 = row.get(3)?;
            Ok(Layout {
                id: row.get(0)?,
                name: row.get(1)?,
                screen,
                built_in: built_in != 0,
            })
        })?;
        rows.collect()
    }

    pub fn get(&self, id: &str) -> Result<Layout, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, tree, built_in FROM layouts WHERE id = ?1",
        )?;
        stmt.query_row(params![id], |row| {
            let tree_json: String = row.get(2)?;
            let screen: Screen = serde_json::from_str(&tree_json)
                .unwrap_or_else(|_| Screen::default());
            let built_in: i32 = row.get(3)?;
            Ok(Layout {
                id: row.get(0)?,
                name: row.get(1)?,
                screen,
                built_in: built_in != 0,
            })
        })
    }

    pub fn create(&self, name: &str, screen: Screen, built_in: bool) -> Result<Layout, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let now = now_epoch_millis();
        let screen_json = serde_json::to_string(&screen)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        self.conn.execute(
            "INSERT INTO layouts (id, name, tree, built_in, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, name, screen_json, built_in as i32, now, now],
        )?;
        Ok(Layout {
            id,
            name: name.to_string(),
            screen,
            built_in,
        })
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        let affected = self.conn.execute("DELETE FROM layouts WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn delete_non_builtin(&self, id: &str) -> Result<(), rusqlite::Error> {
        let built_in: i32 = self.conn.query_row(
            "SELECT built_in FROM layouts WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if built_in != 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "Built-in layout cannot be modified".to_string(),
            ));
        }
        self.delete(id)
    }

    pub fn delete_all(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM layouts WHERE built_in = 0", [])?;
        Ok(())
    }

    pub fn rename(&self, id: &str, new_name: &str) -> Result<(), rusqlite::Error> {
        let affected = self.conn.execute(
            "UPDATE layouts SET name = ?1 WHERE id = ?2",
            params![new_name, id],
        )?;
        if affected == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn rename_non_builtin(&self, id: &str, new_name: &str) -> Result<(), rusqlite::Error> {
        let built_in: i32 = self.conn.query_row(
            "SELECT built_in FROM layouts WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        if built_in != 0 {
            return Err(rusqlite::Error::InvalidParameterName(
                "Built-in layout cannot be modified".to_string(),
            ));
        }
        self.rename(id, new_name)
    }

    pub fn find_by_name(&self, name: &str) -> Result<Layout, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, tree, built_in FROM layouts WHERE name = ?1",
        )?;
        stmt.query_row(params![name], |row| {
            let tree_json: String = row.get(2)?;
            let screen: Screen = serde_json::from_str(&tree_json)
                .unwrap_or_else(|_| Screen::default());
            let built_in: i32 = row.get(3)?;
            Ok(Layout {
                id: row.get(0)?,
                name: row.get(1)?,
                screen,
                built_in: built_in != 0,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::database::Database;

    fn setup_db() -> Database {
        Database::new(":memory:".into())
    }

    fn default_screen() -> crate::domain::Screen {
        crate::domain::Screen::default()
    }

    #[test]
    fn test_create_layout() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        let layout = repo.create("Test", default_screen(), false).unwrap();
        assert_eq!(layout.name, "Test");
        assert!(!layout.built_in);
    }

    #[test]
    fn test_list_layouts() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        repo.create("A", default_screen(), false).unwrap();
        repo.create("B", default_screen(), false).unwrap();
        let list = repo.list().unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_get_layout() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        let created = repo.create("Test", default_screen(), false).unwrap();
        let got = repo.get(&created.id).unwrap();
        assert_eq!(got.id, created.id);
    }

    #[test]
    fn test_delete_layout() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        let created = repo.create("Test", default_screen(), false).unwrap();
        repo.delete(&created.id).unwrap();
        assert!(repo.get(&created.id).is_err());
    }

    #[test]
    fn test_delete_non_builtin_rejects_built_in() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        let created = repo.create("General", default_screen(), true).unwrap();
        let result = repo.delete_non_builtin(&created.id);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_all_only_removes_non_builtin() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        repo.create("User", default_screen(), false).unwrap();
        repo.create("General", default_screen(), true).unwrap();
        repo.delete_all().unwrap();
        let remaining = repo.list().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].name, "General");
    }

    #[test]
    fn test_rename_layout() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        let created = repo.create("Old", default_screen(), false).unwrap();
        repo.rename(&created.id, "New").unwrap();
        let got = repo.get(&created.id).unwrap();
        assert_eq!(got.name, "New");
    }

    #[test]
    fn test_rename_non_builtin_rejects_built_in() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        let created = repo.create("General", default_screen(), true).unwrap();
        let result = repo.rename_non_builtin(&created.id, "Not General");
        assert!(result.is_err());
    }

    #[test]
    fn test_find_by_name() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        repo.create("General", default_screen(), true).unwrap();
        let found = repo.find_by_name("General").unwrap();
        assert!(found.built_in);
    }

    #[test]
    fn test_builtin_flag_roundtrip() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.layouts(&conn);
        let created = repo.create("General", default_screen(), true).unwrap();
        let got = repo.get(&created.id).unwrap();
        assert!(got.built_in);
    }
}
