use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeChunk {
    pub file_path: String,
    pub symbol_name: String,
    pub symbol_type: String,
    pub line_start: usize,
    pub line_end: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredChunk {
    pub id: String,
    pub repo_path: String,
    pub file_path: String,
    pub symbol_name: String,
    pub symbol_type: String,
    pub line_start: i32,
    pub line_end: i32,
    pub chunk_text: String,
    pub embedding_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub file_path: String,
    pub symbol_name: String,
    pub symbol_type: String,
    pub line_start: i32,
    pub line_end: i32,
    pub chunk_text: String,
    pub score: f32,
}

pub struct VectorStore<'a> {
    conn: &'a rusqlite::Connection,
    model: fastembed::TextEmbedding,
}

impl<'a> VectorStore<'a> {
    pub fn new(conn: &'a rusqlite::Connection) -> Result<Self, Box<dyn std::error::Error>> {
        let model = fastembed::TextEmbedding::try_new(Default::default())?;
        Ok(VectorStore { conn, model })
    }

    pub fn embed_query(&mut self, text: &str) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
        let embeddings = self.model.embed(vec![text.to_string()], None)?;
        Ok(embeddings.into_iter().next().unwrap_or_default())
    }

    pub fn index_repo(&mut self, repo_path: &str) -> Result<usize, Box<dyn std::error::Error>> {
        self.clear_repo(repo_path)?;

        let chunks = extract_code_chunks(repo_path)?;

        let texts: Vec<String> = chunks.iter().map(|c| c.text.clone()).collect();
        if texts.is_empty() {
            return Ok(0);
        }
        let embeddings = self.model.embed(texts, None)?;

        let now = chrono::Utc::now().timestamp();
        let mut count = 0;
        for (chunk, embedding) in chunks.iter().zip(embeddings.iter()) {
            let id = uuid::Uuid::new_v4().to_string();
            let embedding_json = serde_json::to_string(embedding)?;
            self.conn.execute(
                "INSERT INTO code_vectors (id, repo_path, file_path, symbol_name, symbol_type, line_start, line_end, chunk_text, embedding_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    id,
                    repo_path,
                    chunk.file_path,
                    chunk.symbol_name,
                    chunk.symbol_type,
                    chunk.line_start as i32,
                    chunk.line_end as i32,
                    chunk.text,
                    embedding_json,
                    now,
                ],
            )?;
            count += 1;
        }

        Ok(count)
    }

    pub fn search(
        &mut self,
        repo_path: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>, Box<dyn std::error::Error>> {
        let query_embedding = self.embed_query(query)?;

        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, symbol_name, symbol_type, line_start, line_end, chunk_text, embedding_json
             FROM code_vectors WHERE repo_path = ?1",
        )?;
        let rows = stmt.query_map(params![repo_path], |row| {
            Ok(StoredChunk {
                id: row.get(0)?,
                repo_path: repo_path.to_string(),
                file_path: row.get(1)?,
                symbol_name: row.get(2)?,
                symbol_type: row.get(3)?,
                line_start: row.get(4)?,
                line_end: row.get(5)?,
                chunk_text: row.get(6)?,
                embedding_json: row.get(7)?,
            })
        })?;

        let mut results: Vec<SearchResult> = Vec::new();
        for row in rows {
            let chunk = row?;
            let chunk_embedding: Vec<f32> = serde_json::from_str(&chunk.embedding_json)
                .unwrap_or_default();
            let score = fastembed::similarity::cosine_similarity(&query_embedding, &chunk_embedding);
            results.push(SearchResult {
                file_path: chunk.file_path,
                symbol_name: chunk.symbol_name,
                symbol_type: chunk.symbol_type,
                line_start: chunk.line_start,
                line_end: chunk.line_end,
                chunk_text: chunk.chunk_text,
                score,
            });
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        Ok(results)
    }

    pub fn count_chunks(&self, repo_path: &str) -> Result<usize, rusqlite::Error> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM code_vectors WHERE repo_path = ?1",
            params![repo_path],
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }

    fn clear_repo(&self, repo_path: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM code_vectors WHERE repo_path = ?1",
            params![repo_path],
        )?;
        Ok(())
    }
}

#[cfg(test)]
fn is_supported(file_path: &str) -> bool {
    ai_agent_workspace_code_intelligence::is_supported(file_path)
}

pub fn extract_code_chunks(repo_path: &str) -> Result<Vec<CodeChunk>, Box<dyn std::error::Error>> {
    let mut chunks = Vec::new();

    // Reuse the shared filtered walker from code-intelligence, which excludes
    // node_modules/.git/target/.scratch and only returns supported files. This
    // keeps exclusion logic in one place so the two indexers can't drift.
    let files = ai_agent_workspace_code_intelligence::collect_supported_files(repo_path)?;
    for path in files {
        let relative = path.strip_prefix(repo_path).unwrap_or(&path);
        let file_path = relative.to_string_lossy().to_string();

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        extract_chunks_from_file(&file_path, &content, &mut chunks);
    }

    Ok(chunks)
}

fn extract_chunks_from_file(file_path: &str, content: &str, chunks: &mut Vec<CodeChunk>) {
    let ext = std::path::Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let patterns = match ext {
        "rs" => vec![
            ("function", r"(?:pub\s+)?(?:async\s+)?fn\s+(\w+)"),
            ("struct", r"(?:pub\s+)?struct\s+(\w+)"),
            ("enum", r"(?:pub\s+)?enum\s+(\w+)"),
            ("trait", r"(?:pub\s+)?trait\s+(\w+)"),
            ("impl", r"impl(?:\s+<[^>]+>)?\s+(\w+(?:::\w+)*)"),
        ],
        "ts" | "tsx" | "js" | "jsx" => vec![
            ("function", r"(?:export\s+)?(?:async\s+)?function\s+(\w+)"),
            ("class", r"(?:export\s+)?class\s+(\w+)"),
            ("interface", r"(?:export\s+)?interface\s+(\w+)"),
            ("arrow", r"(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>"),
        ],
        _ => return,
    };

    let lines: Vec<&str> = content.lines().collect();

    for (sym_type, pattern) in patterns {
        let re = regex::Regex::new(pattern).unwrap();
        for mat in re.find_iter(content) {
            let start_byte = mat.start();
            let line_start = content[..start_byte].lines().count();
            let cap = re.captures_at(content, start_byte).unwrap();
            let symbol_name = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();

            let mut depth = 0;
            let mut line_end = line_start;
            let mut found_open = false;

            for (i, line) in lines.iter().enumerate().skip(line_start.saturating_sub(1)) {
                for ch in line.chars() {
                    match ch {
                        '{' => {
                            depth += 1;
                            found_open = true;
                        }
                        '}' => {
                            depth -= 1;
                            if found_open && depth == 0 {
                                line_end = i + 1;
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                if found_open && depth == 0 {
                    break;
                }
                line_end = i + 1;
            }

            let start_idx = line_start.saturating_sub(1);
            let end_idx = line_end.min(lines.len());
            let chunk_text: String = lines[start_idx..end_idx].join("\n");

            chunks.push(CodeChunk {
                file_path: file_path.to_string(),
                symbol_name,
                symbol_type: sym_type.to_string(),
                line_start,
                line_end,
                text: chunk_text,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        let sim = fastembed::similarity::cosine_similarity(&a, &b);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let sim = fastembed::similarity::cosine_similarity(&a, &b);
        assert!((sim - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_is_supported() {
        assert!(is_supported("main.rs"));
        assert!(is_supported("app.ts"));
        assert!(is_supported("component.tsx"));
        assert!(is_supported("index.js"));
        assert!(is_supported("page.jsx"));
        assert!(!is_supported("data.json"));
        assert!(!is_supported("readme.md"));
    }

    #[test]
    fn test_extract_chunks_rust() {
        let source = r#"
fn main() {
    println!("hello");
}

fn add(a: i32, b: i32) -> i32 {
    a + b
}

struct Point {
    x: f64,
    y: f64,
}
"#;
        let mut chunks = Vec::new();
        extract_chunks_from_file("test.rs", source, &mut chunks);
        assert!(chunks.len() >= 3);
        let names: Vec<&str> = chunks.iter().map(|c| c.symbol_name.as_str()).collect();
        assert!(names.contains(&"main"));
        assert!(names.contains(&"add"));
        assert!(names.contains(&"Point"));
    }

    #[test]
    fn test_extract_chunks_typescript() {
        let source = r#"
function greet(name: string): void {
    console.log(name);
}

class Animal {
    name: string;
}
"#;
        let mut chunks = Vec::new();
        extract_chunks_from_file("test.ts", source, &mut chunks);
        assert!(chunks.len() >= 2);
        let names: Vec<&str> = chunks.iter().map(|c| c.symbol_name.as_str()).collect();
        assert!(names.contains(&"greet"));
        assert!(names.contains(&"Animal"));
    }
}
