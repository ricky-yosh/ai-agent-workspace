use std::path::Path;

/// Derives a local socket name from the database path.
/// On macOS/Linux: returns a Unix domain socket path in the same directory
/// On Windows: returns a named pipe name
pub fn socket_name_from_db_path(db_path: &Path) -> String {
    // Use a hash of the db path to create a unique, fixed-length name
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    db_path.hash(&mut hasher);
    let hash = hasher.finish();

    format!("aiaw-events-{:016x}", hash)
}

/// Returns the full path for a Unix domain socket derived from the DB path.
/// Places the socket in the same directory as the DB file.
pub fn socket_path_from_db_path(db_path: &Path) -> std::path::PathBuf {
    let dir = db_path.parent().unwrap_or(std::path::Path::new("/tmp"));
    let name = socket_name_from_db_path(db_path);
    dir.join(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn socket_name_is_deterministic() {
        let path = PathBuf::from("/some/path/workspace.db");
        let name1 = socket_name_from_db_path(&path);
        let name2 = socket_name_from_db_path(&path);
        assert_eq!(name1, name2);
    }

    #[test]
    fn socket_name_starts_with_prefix() {
        let path = PathBuf::from("/some/path/workspace.db");
        let name = socket_name_from_db_path(&path);
        assert!(name.starts_with("aiaw-events-"));
    }

    #[test]
    fn socket_name_differs_for_different_paths() {
        let path1 = PathBuf::from("/path/a/workspace.db");
        let path2 = PathBuf::from("/path/b/workspace.db");
        assert_ne!(
            socket_name_from_db_path(&path1),
            socket_name_from_db_path(&path2)
        );
    }

    #[test]
    fn socket_path_is_in_same_directory() {
        let db_path = PathBuf::from("/home/user/data/workspace.db");
        let socket_path = socket_path_from_db_path(&db_path);
        assert!(socket_path.starts_with("/home/user/data/"));
    }
}
