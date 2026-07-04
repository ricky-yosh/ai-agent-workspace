use std::fmt;
use std::path::Path;
use std::process::Command;

/// Errors that can occur during git operations.
#[derive(Debug)]
pub enum GitError {
    NotGitRepo(String),
    CommandFailed(String),
    IoError(String),
}

impl fmt::Display for GitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GitError::NotGitRepo(path) => write!(f, "Not a git repository: {}", path),
            GitError::CommandFailed(msg) => write!(f, "{}", msg),
            GitError::IoError(msg) => write!(f, "{}", msg),
        }
    }
}

impl From<std::io::Error> for GitError {
    fn from(err: std::io::Error) -> Self {
        GitError::IoError(err.to_string())
    }
}

/// Commit information returned by search_history.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub message: String,
}

/// Blame entry returned by blame.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BlameEntry {
    pub line_number: u32,
    pub author: String,
    pub author_email: String,
    pub commit_hash: String,
    pub date: String,
}

/// A single CODEOWNERS rule.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CodeOwnersRule {
    pub pattern: String,
    pub owners: Vec<String>,
}

/// Result from get_owners.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OwnersResult {
    pub file: Option<String>,
    pub rules: Vec<CodeOwnersRule>,
}

/// Result from get_diff.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitDiffResult {
    pub diff: String,
    pub staged: bool,
}

/// Check if the given path is inside a git repository.
pub fn is_git_repo(repo_path: &str) -> bool {
    Path::new(repo_path).join(".git").exists()
}

/// Search git commit history by keyword, author, and date range.
pub fn search_history(
    repo_path: &str,
    keyword: Option<&str>,
    author: Option<&str>,
    after: Option<&str>,
    before: Option<&str>,
    max_results: Option<u32>,
) -> Result<Vec<CommitInfo>, GitError> {
    if !is_git_repo(repo_path) {
        return Err(GitError::NotGitRepo(repo_path.to_string()));
    }
    let max = max_results.unwrap_or(50);
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(repo_path)
        .args(["log", "--format=%H|%an|%ae|%aI|%s"])
        .arg(format!("--max-count={}", max));
    if let Some(kw) = keyword {
        cmd.arg(format!("--grep={}", kw));
    }
    if let Some(a) = author {
        cmd.arg(format!("--author={}", a));
    }
    if let Some(af) = after {
        cmd.arg(format!("--after={}", af));
    }
    if let Some(bf) = before {
        cmd.arg(format!("--before={}", bf));
    }
    let output = cmd.output()
        .map_err(|e| GitError::CommandFailed(format!("Failed to run git: {}", e)))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitError::CommandFailed(format!("git log failed: {}", stderr.trim())));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits: Vec<CommitInfo> = stdout.lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() < 5 { return None; }
            Some(CommitInfo {
                hash: parts[0].to_string(),
                author_name: parts[1].to_string(),
                author_email: parts[2].to_string(),
                date: parts[3].to_string(),
                message: parts[4].to_string(),
            })
        })
        .collect();
    Ok(commits)
}

/// Run git blame on a file to see per-line ownership.
pub fn blame(repo_path: &str, file_path: &str) -> Result<Vec<BlameEntry>, GitError> {
    if !is_git_repo(repo_path) {
        return Err(GitError::NotGitRepo(repo_path.to_string()));
    }
    let output = Command::new("git")
        .arg("-C").arg(repo_path)
        .args(["blame", "--porcelain", file_path])
        .output()
        .map_err(|e| GitError::CommandFailed(format!("Failed to run git: {}", e)))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitError::CommandFailed(format!("git blame failed: {}", stderr.trim())));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries: Vec<BlameEntry> = Vec::new();
    let mut current_hash = "";
    let mut current_author = "";
    let mut current_author_email = "";
    let mut current_time = "";
    let mut current_line = 0u32;
    for line in stdout.lines() {
        if line.starts_with('\t') {
            if current_line > 0 {
                entries.push(BlameEntry {
                    line_number: current_line,
                    author: current_author.to_string(),
                    author_email: current_author_email.to_string(),
                    commit_hash: current_hash.to_string(),
                    date: current_time.to_string(),
                });
                current_line = 0;
            }
            continue;
        }
        if line.len() >= 40 && line.as_bytes()[40] == b' ' {
            let parts: Vec<&str> = line.splitn(3, ' ').collect();
            if parts.len() >= 3 {
                current_hash = parts[0];
                if let Ok(n) = parts[1].parse::<u32>() {
                    current_line = n;
                }
            }
            current_author = "";
            current_author_email = "";
            current_time = "";
        } else if let Some(rest) = line.strip_prefix("author ") {
            current_author = rest;
        } else if let Some(rest) = line.strip_prefix("author-mail ") {
            current_author_email = rest;
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            current_time = rest;
        }
    }
    Ok(entries)
}

/// Parse CODEOWNERS file to find owners for a given path.
pub fn get_owners(repo_path: &str, path: Option<&str>) -> Result<OwnersResult, GitError> {
    if !is_git_repo(repo_path) {
        return Err(GitError::NotGitRepo(repo_path.to_string()));
    }
    let candidates = [
        "CODEOWNERS",
        ".github/CODEOWNERS",
        ".gitlab/CODEOWNERS",
        "docs/CODEOWNERS",
    ];
    let repo = Path::new(repo_path);
    let mut found_file = None;
    for candidate in &candidates {
        let p = repo.join(candidate);
        if p.exists() {
            found_file = Some((candidate.to_string(), std::fs::read_to_string(&p)
                .map_err(|e| GitError::IoError(format!("Failed to read {}: {}", candidate, e)))?));
            break;
        }
    }
    let (file_name, content) = match found_file {
        Some(fc) => fc,
        None => {
            return Ok(OwnersResult {
                file: None,
                rules: Vec::new(),
            });
        }
    };
    let mut rules: Vec<CodeOwnersRule> = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let mut parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 2 { continue; }
        let pattern = parts.remove(0).to_string();
        let owners: Vec<String> = parts.iter().map(|s| s.to_string()).collect();
        if let Some(p) = path {
            if !pattern_matches_path(&pattern, p) {
                continue;
            }
        }
        rules.push(CodeOwnersRule { pattern, owners });
    }
    Ok(OwnersResult {
        file: Some(file_name),
        rules,
    })
}

/// Get git diff output for a repository.
pub fn get_diff(repo_path: &str, staged: bool) -> Result<GitDiffResult, GitError> {
    if !is_git_repo(repo_path) {
        return Err(GitError::NotGitRepo(repo_path.to_string()));
    }
    let mut args = vec!["diff".to_string()];
    if staged {
        args.push("--staged".to_string());
    }
    let output = Command::new("git")
        .arg("-C").arg(repo_path)
        .args(&args)
        .output()
        .map_err(|e| GitError::CommandFailed(format!("Failed to run git diff: {}", e)))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitError::CommandFailed(format!("git diff failed: {}", stderr)));
    }
    let diff = String::from_utf8(output.stdout)
        .map_err(|e| GitError::IoError(format!("Failed to parse git diff output: {}", e)))?;
    Ok(GitDiffResult { diff, staged })
}

/// Match a CODEOWNERS pattern against a file path.
pub fn pattern_matches_path(pattern: &str, path: &str) -> bool {
    let pat = pattern.trim_start_matches('/');
    let p = path.trim_start_matches('/');
    if pat.ends_with('/') {
        return p.starts_with(pat);
    }
    if let Some(prefix) = pat.strip_suffix("/**") {
        return p.starts_with(prefix);
    }
    if !pat.contains('/') {
        let filename = p.rsplit('/').next().unwrap_or(p);
        if pat.starts_with("*.") {
            return filename.ends_with(&pat[1..]);
        }
        return filename == pat;
    }
    if pat.contains('*') {
        let pat_parts: Vec<&str> = pat.split('/').collect();
        let path_parts: Vec<&str> = p.split('/').collect();
        if pat_parts.len() != path_parts.len() { return false; }
        return pat_parts.iter().zip(path_parts.iter()).all(|(pp, fp)| {
            if pp.contains('*') {
                let sub_pat = pp.replace('*', "");
                fp.contains(sub_pat.as_str())
            } else {
                pp == fp
            }
        });
    }
    pat == p
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_git_repo() -> (TempDir, String) {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap().to_string();
        Command::new("git")
            .args(["init"])
            .current_dir(&path)
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.name", "Test Author"])
            .current_dir(&path)
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(&path)
            .output()
            .unwrap();
        std::fs::write(dir.path().join("hello.txt"), "line one\nline two\n").unwrap();
        Command::new("git")
            .args(["add", "."])
            .current_dir(&path)
            .output()
            .unwrap();
        Command::new("git")
            .args(["-c", "user.name=Test Author", "-c", "user.email=test@example.com", "commit", "-m", "Initial commit"])
            .current_dir(&path)
            .output()
            .unwrap();
        (dir, path)
    }

    #[test]
    fn test_is_git_repo_true() {
        let (_dir, path) = setup_git_repo();
        assert!(is_git_repo(&path));
    }

    #[test]
    fn test_is_git_repo_false() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap();
        assert!(!is_git_repo(path));
    }

    #[test]
    fn test_search_history_basic() {
        let (_dir, path) = setup_git_repo();
        let commits = search_history(&path, None, None, None, None, None).unwrap();
        assert!(!commits.is_empty());
        assert_eq!(commits[0].author_name, "Test Author");
        assert_eq!(commits[0].message, "Initial commit");
        assert_eq!(commits[0].hash.len(), 40);
    }

    #[test]
    fn test_search_history_keyword() {
        let (_dir, path) = setup_git_repo();
        let commits = search_history(&path, Some("Initial"), None, None, None, None).unwrap();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].message, "Initial commit");
    }

    #[test]
    fn test_search_history_no_results() {
        let (_dir, path) = setup_git_repo();
        let commits = search_history(&path, Some("nonexistent"), None, None, None, None).unwrap();
        assert_eq!(commits.len(), 0);
    }

    #[test]
    fn test_search_history_not_git_repo() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap();
        let result = search_history(path, None, None, None, None, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_blame_basic() {
        let (_dir, path) = setup_git_repo();
        let entries = blame(&path, "hello.txt").unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].author, "Test Author");
        assert_eq!(entries[0].commit_hash.len(), 40);
        assert_eq!(entries[0].line_number, 1);
        assert_eq!(entries[1].line_number, 2);
    }

    #[test]
    fn test_blame_not_git_repo() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap();
        let result = blame(path, "foo.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_get_owners_no_file() {
        let (_dir, path) = setup_git_repo();
        let result = get_owners(&path, None).unwrap();
        assert!(result.file.is_none());
        assert_eq!(result.rules.len(), 0);
    }

    #[test]
    fn test_get_owners_with_file() {
        let (_dir, path) = setup_git_repo();
        std::fs::write(
            std::path::PathBuf::from(&path).join("CODEOWNERS"),
            "# Comments are ignored\n*.rs @rust-team\nsrc/auth/ @auth-team @security-team\n",
        ).unwrap();
        let result = get_owners(&path, None).unwrap();
        assert_eq!(result.file.as_deref(), Some("CODEOWNERS"));
        assert_eq!(result.rules.len(), 2);
        assert_eq!(result.rules[0].pattern, "*.rs");
        assert_eq!(result.rules[0].owners[0], "@rust-team");
        assert_eq!(result.rules[1].pattern, "src/auth/");
    }

    #[test]
    fn test_get_owners_filter_by_path() {
        let (_dir, path) = setup_git_repo();
        std::fs::write(
            std::path::PathBuf::from(&path).join("CODEOWNERS"),
            "*.rs @rust-team\n*.ts @frontend-team\n",
        ).unwrap();
        let result = get_owners(&path, Some("src/main.rs")).unwrap();
        assert_eq!(result.rules.len(), 1);
        assert_eq!(result.rules[0].pattern, "*.rs");
    }

    #[test]
    fn test_get_owners_not_git_repo() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().to_str().unwrap();
        let result = get_owners(path, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_pattern_matches_path_dir() {
        assert!(pattern_matches_path("src/", "src/main.rs"));
        assert!(!pattern_matches_path("src/", "lib/main.rs"));
    }

    #[test]
    fn test_pattern_matches_path_glob() {
        assert!(pattern_matches_path("*.rs", "main.rs"));
        assert!(!pattern_matches_path("*.rs", "main.js"));
    }

    #[test]
    fn test_pattern_matches_path_double_star() {
        assert!(pattern_matches_path("src/**", "src/auth/login.rs"));
        assert!(!pattern_matches_path("src/**", "lib/main.rs"));
    }

    #[test]
    fn test_pattern_matches_path_literal() {
        assert!(pattern_matches_path("CODEOWNERS", "CODEOWNERS"));
        assert!(pattern_matches_path("CODEOWNERS", "src/CODEOWNERS"));
        assert!(!pattern_matches_path("CODEOWNERS", "CODEOWNERS.bak"));
    }
}
