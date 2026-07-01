use std::path::{Path, PathBuf};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::domain::{Issue, IssueSummary};

fn now_epoch_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn epoch_millis_to_iso(millis: i64) -> String {
    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .unwrap_or_default();
    dt.to_rfc3339()
}

pub struct IssueRepository<'a> {
    _db_path: PathBuf,
    conn: &'a Connection,
}

impl<'a> IssueRepository<'a> {
    pub fn new(db_path: &Path, conn: &'a Connection) -> Self {
        IssueRepository {
            _db_path: db_path.to_path_buf(),
            conn,
        }
    }

    pub fn create(&self, session_id: &str, title: &str, body: &str) -> Result<Issue, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let number = self.next_number(session_id)?;
        let now = now_epoch_millis();
        let labels = r#"["needs-triage"]"#;
        self.conn.execute(
            "INSERT INTO issues (id, session_id, number, title, body, state, labels, author, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, session_id, number, title, body, "open", labels, "ai", now, now],
        )?;
        Ok(Issue {
            id,
            session_id: session_id.to_string(),
            number,
            title: title.to_string(),
            body: body.to_string(),
            state: "open".to_string(),
            labels: vec!["needs-triage".to_string()],
            author: "ai".to_string(),
            created_at: epoch_millis_to_iso(now),
            updated_at: epoch_millis_to_iso(now),
        })
    }

    fn next_number(&self, session_id: &str) -> Result<i32, rusqlite::Error> {
        let max: Option<i32> = self.conn.query_row(
            "SELECT MAX(number) FROM issues WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        ).unwrap_or(None);
        Ok(max.unwrap_or(0) + 1)
    }

    pub fn list_by_session(&self, session_id: &str) -> Result<Vec<Issue>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, number, title, body, state, labels, author, created_at, updated_at
             FROM issues WHERE session_id = ?1
             ORDER BY CASE WHEN state = 'open' THEN 0 ELSE 1 END, number"
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            let labels_json: String = row.get(6)?;
            let labels: Vec<String> = serde_json::from_str(&labels_json)
                .unwrap_or_default();
            let created: i64 = row.get(8)?;
            let updated: i64 = row.get(9)?;
            Ok(Issue {
                id: row.get(0)?,
                session_id: row.get(1)?,
                number: row.get(2)?,
                title: row.get(3)?,
                body: row.get(4)?,
                state: row.get(5)?,
                labels,
                author: row.get(7)?,
                created_at: epoch_millis_to_iso(created),
                updated_at: epoch_millis_to_iso(updated),
            })
        })?;
        rows.collect()
    }

    pub fn get(&self, id: &str) -> Result<Issue, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, session_id, number, title, body, state, labels, author, created_at, updated_at
             FROM issues WHERE id = ?1",
            params![id],
            |row| {
                let labels_json: String = row.get(6)?;
                let labels: Vec<String> = serde_json::from_str(&labels_json)
                    .unwrap_or_default();
                let created: i64 = row.get(8)?;
                let updated: i64 = row.get(9)?;
                Ok(Issue {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    number: row.get(2)?,
                    title: row.get(3)?,
                    body: row.get(4)?,
                    state: row.get(5)?,
                    labels,
                    author: row.get(7)?,
                    created_at: epoch_millis_to_iso(created),
                    updated_at: epoch_millis_to_iso(updated),
                })
            },
        )
    }

    pub fn get_by_number(&self, session_id: &str, number: i32) -> Result<Issue, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, session_id, number, title, body, state, labels, author, created_at, updated_at
             FROM issues WHERE session_id = ?1 AND number = ?2",
            params![session_id, number],
            |row| {
                let labels_json: String = row.get(6)?;
                let labels: Vec<String> = serde_json::from_str(&labels_json)
                    .unwrap_or_default();
                let created: i64 = row.get(8)?;
                let updated: i64 = row.get(9)?;
                Ok(Issue {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    number: row.get(2)?,
                    title: row.get(3)?,
                    body: row.get(4)?,
                    state: row.get(5)?,
                    labels,
                    author: row.get(7)?,
                    created_at: epoch_millis_to_iso(created),
                    updated_at: epoch_millis_to_iso(updated),
                })
            },
        )
    }

    pub fn resolve(&self, issue_ref: &str, session_id: &str) -> Result<Issue, rusqlite::Error> {
        // Try UUID first
        if let Ok(issue) = self.get(issue_ref) {
            return Ok(issue);
        }
        // Try as issue number
        if let Ok(number) = issue_ref.parse::<i32>() {
            return self.get_by_number(session_id, number);
        }
        // Neither UUID nor number — return the original get error
        self.get(issue_ref)
    }

    pub fn update(&self, id: &str, title: Option<&str>, body: Option<&str>, labels: Option<&[String]>, state: Option<&str>) -> Result<Issue, rusqlite::Error> {
        let now = now_epoch_millis();
        let mut set_clauses = vec!["updated_at = ?".to_string()];
        let mut values: Vec<rusqlite::types::Value> = vec![rusqlite::types::Value::Integer(now)];

        if let Some(t) = title {
            set_clauses.push("title = ?".to_string());
            values.push(rusqlite::types::Value::Text(t.to_string()));
        }
        if let Some(b) = body {
            set_clauses.push("body = ?".to_string());
            values.push(rusqlite::types::Value::Text(b.to_string()));
        }
        if let Some(l) = labels {
            set_clauses.push("labels = ?".to_string());
            values.push(rusqlite::types::Value::Text(serde_json::to_string(l).unwrap()));
        }
        if let Some(s) = state {
            set_clauses.push("state = ?".to_string());
            values.push(rusqlite::types::Value::Text(s.to_string()));
        }

        let sql = format!("UPDATE issues SET {} WHERE id = ?", set_clauses.join(", "));
        values.push(rusqlite::types::Value::Text(id.to_string()));

        self.conn.execute(&sql, rusqlite::params_from_iter(values.iter()))?;

        self.get(id)
    }

    pub fn close(&self, id: &str) -> Result<Issue, rusqlite::Error> {
        self.update(id, None, None, None, Some("closed"))
    }

    pub fn delete(&self, id: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM issues WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn search(
        &self,
        session_id: &str,
        state: Option<&str>,
        label: Option<&str>,
        keyword: Option<&str>,
    ) -> Result<Vec<Issue>, rusqlite::Error> {
        let all = self.list_by_session(session_id)?;
        let results = all.into_iter().filter(|issue| {
            if let Some(s) = state {
                if issue.state != s {
                    return false;
                }
            }
            if let Some(l) = label {
                if !issue.labels.iter().any(|lbl| lbl == l) {
                    return false;
                }
            }
            if let Some(kw) = keyword {
                let kw_lower = kw.to_lowercase();
                if !issue.title.to_lowercase().contains(&kw_lower)
                    && !issue.body.to_lowercase().contains(&kw_lower)
                {
                    return false;
                }
            }
            true
        }).collect();
        Ok(results)
    }

    pub fn get_next(&self, session_id: &str) -> Result<Option<Issue>, rusqlite::Error> {
        fn label_priority(issue: &Issue) -> usize {
            let order = ["ready-for-agent", "ready-for-human", "needs-info", "needs-triage"];
            for (i, lbl) in order.iter().enumerate() {
                if issue.labels.iter().any(|l| l == lbl) {
                    return i;
                }
            }
            order.len()
        }

        let all = self.list_by_session(session_id)?;
        let mut open: Vec<Issue> = all.into_iter().filter(|i| i.state == "open").collect();
        open.sort_by(|a, b| {
            label_priority(a).cmp(&label_priority(b))
                .then(a.number.cmp(&b.number))
        });
        Ok(open.into_iter().next())
    }

    pub fn summarize(&self, session_id: &str) -> Result<IssueSummary, rusqlite::Error> {
        let all = self.list_by_session(session_id)?;
        let total = all.len();
        let open = all.iter().filter(|i| i.state == "open").count();
        let closed = all.iter().filter(|i| i.state == "closed").count();
        let mut by_label = std::collections::HashMap::new();
        for issue in &all {
            for label in &issue.labels {
                *by_label.entry(label.clone()).or_insert(0usize) += 1;
            }
        }
        Ok(IssueSummary { total, open, closed, by_label })
    }
}

#[cfg(test)]
mod tests {
    use crate::database::Database;
    use rusqlite::params;

    fn setup_db() -> Database {
        Database::new(":memory:".into())
    }

    #[test]
    fn test_issue_repository_stub() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let _repo = db.issues(&conn);
    }

    #[test]
    fn test_create_issue_assigns_number_one() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Bug", "Something broke").unwrap();
        assert_eq!(issue.number, 1);
        assert_eq!(issue.title, "Bug");
        assert_eq!(issue.body, "Something broke");
        assert_eq!(issue.state, "open");
        assert_eq!(issue.labels, vec!["needs-triage"]);
        assert_eq!(issue.author, "ai");
    }

    #[test]
    fn test_create_issue_assigns_sequential_numbers() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue1 = repo.create(&session.id, "First", "").unwrap();
        let issue2 = repo.create(&session.id, "Second", "").unwrap();
        assert_eq!(issue1.number, 1);
        assert_eq!(issue2.number, 2);
    }

    #[test]
    fn test_two_sessions_get_independent_numbering() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session1 = sessions.create("/tmp", "A").unwrap();
        let session2 = sessions.create("/tmp", "B").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session1.id, "First", "").unwrap();
        let i2 = repo.create(&session2.id, "Second", "").unwrap();
        let i3 = repo.create(&session1.id, "Third", "").unwrap();
        assert_eq!(i1.number, 1);
        assert_eq!(i2.number, 1);
        assert_eq!(i3.number, 2);
    }

    #[test]
    fn test_labels_default_to_needs_triage() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Bug", "").unwrap();
        assert_eq!(issue.labels, vec!["needs-triage"]);
    }

    #[test]
    fn test_list_by_session_returns_only_that_sessions_issues() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session1 = sessions.create("/tmp", "A").unwrap();
        let session2 = sessions.create("/tmp", "B").unwrap();
        let repo = db.issues(&conn);

        repo.create(&session1.id, "S1-I1", "").unwrap();
        repo.create(&session1.id, "S1-I2", "").unwrap();
        repo.create(&session2.id, "S2-I1", "").unwrap();

        let list = repo.list_by_session(&session1.id).unwrap();
        assert_eq!(list.len(), 2);
        assert!(list.iter().all(|i| i.session_id == session1.id));

        let list2 = repo.list_by_session(&session2.id).unwrap();
        assert_eq!(list2.len(), 1);
    }

    #[test]
    fn test_get_returns_correct_issue() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Bug", "Something broke").unwrap();
        let fetched = repo.get(&issue.id).unwrap();
        assert_eq!(fetched.id, issue.id);
        assert_eq!(fetched.title, "Bug");
        assert_eq!(fetched.body, "Something broke");
        assert_eq!(fetched.session_id, session.id);
        assert_eq!(fetched.number, issue.number);
        assert_eq!(fetched.state, "open");
    }

    #[test]
    fn test_get_nonexistent_issue_returns_error() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let repo = db.issues(&conn);

        let result = repo.get("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_partial_update_changes_only_supplied_fields() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Original Title", "Original body").unwrap();

        // Update only title
        let updated = repo.update(&issue.id, Some("New Title"), None, None, None).unwrap();
        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.body, "Original body");
        assert_eq!(updated.state, "open");
        assert_eq!(updated.labels, vec!["needs-triage"]);

        // Update only body
        let updated = repo.update(&issue.id, None, Some("New body"), None, None).unwrap();
        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.body, "New body");

        // Update only state
        let updated = repo.update(&issue.id, None, None, None, Some("closed")).unwrap();
        assert_eq!(updated.state, "closed");
    }

    #[test]
    fn test_partial_update_advances_updated_at() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Bug", "").unwrap();
        let initial_updated_millis = chrono::DateTime::parse_from_rfc3339(&issue.updated_at)
            .unwrap()
            .timestamp_millis();

        // Update title
        let updated = repo.update(&issue.id, Some("New Title"), None, None, None).unwrap();
        let new_updated_millis = chrono::DateTime::parse_from_rfc3339(&updated.updated_at)
            .unwrap()
            .timestamp_millis();

        assert!(new_updated_millis >= initial_updated_millis, "updated_at should advance");
    }

    #[test]
    fn test_close_sets_state_and_advances_updated_at() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Bug", "").unwrap();
        assert_eq!(issue.state, "open");

        let initial_updated = chrono::DateTime::parse_from_rfc3339(&issue.updated_at)
            .unwrap()
            .timestamp_millis();

        let closed = repo.close(&issue.id).unwrap();
        assert_eq!(closed.state, "closed");

        let closed_updated = chrono::DateTime::parse_from_rfc3339(&closed.updated_at)
            .unwrap()
            .timestamp_millis();
        assert!(closed_updated >= initial_updated, "updated_at should advance on close");
    }

    #[test]
    fn test_reopen_sets_state_back_to_open() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Bug", "").unwrap();
        repo.close(&issue.id).unwrap();
        let reopened = repo.update(&issue.id, None, None, None, Some("open")).unwrap();
        assert_eq!(reopened.state, "open");
    }

    #[test]
    fn test_labels_round_trip_with_ad_hoc_labels() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Bug", "").unwrap();
        let ad_hoc = vec!["bug".to_string(), "needs-triage".to_string(), "ui".to_string()];
        let updated = repo.update(&issue.id, None, None, Some(&ad_hoc), None).unwrap();
        assert_eq!(updated.labels, ad_hoc);

        // Fetch via get to verify persistence
        let fetched = repo.get(&issue.id).unwrap();
        assert_eq!(fetched.labels, ad_hoc);
    }

    #[test]
    fn test_updated_at_equals_created_at_on_initial_create() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "Bug", "").unwrap();
        assert_eq!(issue.created_at, issue.updated_at);
    }

    #[test]
    fn test_list_by_session_orders_open_first() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session.id, "Open 1", "").unwrap();
        let i2 = repo.create(&session.id, "Open 2", "").unwrap();

        // Manually close i2 by updating state (no close command yet in issue 01)
        conn.execute(
            "UPDATE issues SET state = 'closed' WHERE id = ?1",
            params![i2.id],
        ).unwrap();

        let list = repo.list_by_session(&session.id).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, i1.id);
        assert_eq!(list[0].state, "open");
        assert_eq!(list[1].id, i2.id);
        assert_eq!(list[1].state, "closed");
    }

    #[test]
    fn test_delete_removes_issue() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let issue = repo.create(&session.id, "To Delete", "Gone").unwrap();
        repo.delete(&issue.id).unwrap();
        let result = repo.get(&issue.id);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_session_cascades_to_issues() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        repo.create(&session.id, "Issue 1", "").unwrap();
        repo.create(&session.id, "Issue 2", "").unwrap();

        sessions.delete(&session.id).unwrap();

        let remaining = repo.list_by_session(&session.id).unwrap();
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_list_by_session_empty_after_session_delete() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        repo.create(&session.id, "Issue 1", "").unwrap();
        repo.create(&session.id, "Issue 2", "").unwrap();

        sessions.delete(&session.id).unwrap();

        let remaining = repo.list_by_session(&session.id).unwrap();
        assert_eq!(remaining.len(), 0);
    }

    #[test]
    fn test_search_by_state() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session.id, "Open issue", "").unwrap();
        let i2 = repo.create(&session.id, "Closed issue", "").unwrap();
        repo.close(&i2.id).unwrap();

        let open = repo.search(&session.id, Some("open"), None, None).unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(open[0].id, i1.id);

        let closed = repo.search(&session.id, Some("closed"), None, None).unwrap();
        assert_eq!(closed.len(), 1);
        assert_eq!(closed[0].id, i2.id);
    }

    #[test]
    fn test_search_by_label() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session.id, "Ready issue", "").unwrap();
        repo.update(&i1.id, None, None, Some(&["ready-for-agent".to_string()]), None).unwrap();
        let _i2 = repo.create(&session.id, "Triage issue", "").unwrap();

        let ready = repo.search(&session.id, None, Some("ready-for-agent"), None).unwrap();
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, i1.id);

        let triage = repo.search(&session.id, None, Some("needs-triage"), None).unwrap();
        assert_eq!(triage.len(), 1);
    }

    #[test]
    fn test_search_by_keyword_title() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        repo.create(&session.id, "Fix the login bug", "").unwrap();
        repo.create(&session.id, "Update docs", "").unwrap();

        let results = repo.search(&session.id, None, None, Some("LOGIN")).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Fix the login bug");
    }

    #[test]
    fn test_search_by_keyword_body() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        repo.create(&session.id, "Issue A", "auth failure in production").unwrap();
        repo.create(&session.id, "Issue B", "unrelated content").unwrap();

        let results = repo.search(&session.id, None, None, Some("auth failure")).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Issue A");
    }

    #[test]
    fn test_search_combined_filters() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session.id, "Bug report", "crash on startup").unwrap();
        repo.update(&i1.id, None, None, Some(&["ready-for-agent".to_string()]), None).unwrap();

        let i2 = repo.create(&session.id, "Bug report", "crash on startup").unwrap();
        repo.close(&i2.id).unwrap();
        repo.update(&i2.id, None, None, Some(&["ready-for-agent".to_string()]), None).unwrap();

        let results = repo.search(&session.id, Some("open"), Some("ready-for-agent"), Some("crash")).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, i1.id);
    }

    #[test]
    fn test_search_no_filters_returns_all() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        repo.create(&session.id, "A", "").unwrap();
        repo.create(&session.id, "B", "").unwrap();

        let results = repo.search(&session.id, None, None, None).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_get_next_returns_none_when_no_open() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i = repo.create(&session.id, "Done", "").unwrap();
        repo.close(&i.id).unwrap();

        let next = repo.get_next(&session.id).unwrap();
        assert!(next.is_none());
    }

    #[test]
    fn test_get_next_empty_session() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let next = repo.get_next(&session.id).unwrap();
        assert!(next.is_none());
    }

    #[test]
    fn test_get_next_priority_order() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session.id, "Needs triage", "").unwrap();
        let i2 = repo.create(&session.id, "Ready for agent", "").unwrap();
        repo.update(&i2.id, None, None, Some(&["ready-for-agent".to_string()]), None).unwrap();
        let i3 = repo.create(&session.id, "Needs info", "").unwrap();
        repo.update(&i3.id, None, None, Some(&["needs-info".to_string()]), None).unwrap();

        let next = repo.get_next(&session.id).unwrap().unwrap();
        assert_eq!(next.id, i2.id, "ready-for-agent should come first");

        repo.close(&i2.id).unwrap();
        let next = repo.get_next(&session.id).unwrap().unwrap();
        assert_eq!(next.id, i3.id, "needs-info should come second");

        repo.close(&i3.id).unwrap();
        let next = repo.get_next(&session.id).unwrap().unwrap();
        assert_eq!(next.id, i1.id, "needs-triage should come last");
    }

    #[test]
    fn test_get_next_same_priority_by_number() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session.id, "First", "").unwrap();
        repo.update(&i1.id, None, None, Some(&["ready-for-agent".to_string()]), None).unwrap();
        let i2 = repo.create(&session.id, "Second", "").unwrap();
        repo.update(&i2.id, None, None, Some(&["ready-for-agent".to_string()]), None).unwrap();

        let next = repo.get_next(&session.id).unwrap().unwrap();
        assert_eq!(next.id, i1.id, "lower number wins within same priority tier");
    }

    #[test]
    fn test_summarize_empty() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let summary = repo.summarize(&session.id).unwrap();
        assert_eq!(summary.total, 0);
        assert_eq!(summary.open, 0);
        assert_eq!(summary.closed, 0);
        assert!(summary.by_label.is_empty());
    }

    #[test]
    fn test_summarize_counts() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session.id, "A", "").unwrap();
        let i2 = repo.create(&session.id, "B", "").unwrap();
        repo.close(&i2.id).unwrap();
        repo.create(&session.id, "C", "").unwrap();

        let summary = repo.summarize(&session.id).unwrap();
        assert_eq!(summary.total, 3);
        assert_eq!(summary.open, 2);
        assert_eq!(summary.closed, 1);

        assert_eq!(*summary.by_label.get("needs-triage").unwrap(), 3);
        let _ = i1;
    }

    #[test]
    fn test_summarize_by_label_multi_label() {
        let db = setup_db();
        let conn = db.connection().unwrap();
        let sessions = db.sessions(&conn);
        let session = sessions.create("/tmp", "Test").unwrap();
        let repo = db.issues(&conn);

        let i1 = repo.create(&session.id, "A", "").unwrap();
        repo.update(&i1.id, None, None, Some(&["bug".to_string(), "ready-for-agent".to_string()]), None).unwrap();
        let i2 = repo.create(&session.id, "B", "").unwrap();
        repo.update(&i2.id, None, None, Some(&["bug".to_string()]), None).unwrap();

        let summary = repo.summarize(&session.id).unwrap();
        assert_eq!(summary.total, 2);
        assert_eq!(*summary.by_label.get("bug").unwrap(), 2);
        assert_eq!(*summary.by_label.get("ready-for-agent").unwrap(), 1);
    }
}
