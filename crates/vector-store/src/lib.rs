use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

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
    pub embedding: Vec<u8>,
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

    /// Incrementally (re)index `repo_path`: only files whose content has changed
    /// since the last run are re-embedded; unchanged files are skipped and rows
    /// for deleted files are pruned. Returns the number of chunks re-embedded
    /// this run (0 on a no-op reindex).
    pub fn index_repo(&mut self, repo_path: &str) -> Result<usize, Box<dyn std::error::Error>> {
        // Bound peak memory to one batch of embeddings and wrap all writes in a
        // single transaction (one fsync instead of one per row).
        const EMBED_BATCH: usize = 128;

        self.conn.execute_batch("BEGIN")?;
        match self.index_incremental(repo_path, EMBED_BATCH) {
            Ok(count) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(count)
            }
            Err(e) => {
                // Roll back so a partial index doesn't leak an open
                // transaction onto the reused connection.
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    fn index_incremental(
        &mut self,
        repo_path: &str,
        batch_size: usize,
    ) -> Result<usize, Box<dyn std::error::Error>> {
        let now = chrono::Utc::now().timestamp();
        let files = ai_agent_workspace_code_intelligence::collect_supported_files(repo_path)?;
        let mut seen: HashSet<String> = HashSet::new();
        let mut chunks_written = 0;

        for path in files {
            let relative = path.strip_prefix(repo_path).unwrap_or(&path);
            let file_path = relative.to_string_lossy().to_string();

            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            seen.insert(file_path.clone());

            // Skip files whose content is unchanged since the last index.
            let fingerprint =
                ai_agent_workspace_code_intelligence::CodeIndexer::fingerprint(&content);
            let stored: Option<String> = self
                .conn
                .query_row(
                    "SELECT content_fingerprint FROM code_vectors WHERE repo_path = ?1 AND file_path = ?2 LIMIT 1",
                    params![repo_path, file_path],
                    |row| row.get(0),
                )
                .optional()?;
            if stored.as_deref() == Some(fingerprint.as_str()) {
                continue;
            }

            // Changed or new: replace this file's rows.
            self.conn.execute(
                "DELETE FROM code_vectors WHERE repo_path = ?1 AND file_path = ?2",
                params![repo_path, file_path],
            )?;

            let mut chunks = Vec::new();
            extract_chunks_from_file(&file_path, &content, &mut chunks);
            chunks_written +=
                self.embed_and_insert_file(repo_path, &fingerprint, &chunks, now, batch_size)?;
        }

        // Prune rows for files that no longer exist on disk.
        let existing: Vec<String> = {
            let mut stmt = self
                .conn
                .prepare("SELECT DISTINCT file_path FROM code_vectors WHERE repo_path = ?1")?;
            let rows = stmt.query_map(params![repo_path], |row| row.get(0))?;
            rows.filter_map(|r| r.ok()).collect()
        };
        for file_path in existing {
            if !seen.contains(&file_path) {
                self.conn.execute(
                    "DELETE FROM code_vectors WHERE repo_path = ?1 AND file_path = ?2",
                    params![repo_path, file_path],
                )?;
            }
        }

        Ok(chunks_written)
    }

    /// Embed `chunks` (all belonging to one file) in bounded batches and insert
    /// them, tagging every row with the file's `fingerprint`.
    fn embed_and_insert_file(
        &mut self,
        repo_path: &str,
        fingerprint: &str,
        chunks: &[CodeChunk],
        now: i64,
        batch_size: usize,
    ) -> Result<usize, Box<dyn std::error::Error>> {
        let mut count = 0;

        for batch in chunks.chunks(batch_size) {
            let texts: Vec<&str> = batch.iter().map(|c| c.text.as_str()).collect();
            let embeddings = self.model.embed(texts, None)?;

            for (chunk, embedding) in batch.iter().zip(embeddings.iter()) {
                let id = uuid::Uuid::new_v4().to_string();
                let embedding_bytes = pack_embedding(embedding);
                self.conn.execute(
                    "INSERT INTO code_vectors (id, repo_path, file_path, symbol_name, symbol_type, line_start, line_end, chunk_text, embedding, content_fingerprint, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        id,
                        repo_path,
                        chunk.file_path,
                        chunk.symbol_name,
                        chunk.symbol_type,
                        chunk.line_start as i32,
                        chunk.line_end as i32,
                        chunk.text,
                        embedding_bytes,
                        fingerprint,
                        now,
                    ],
                )?;
                count += 1;
            }
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
            "SELECT id, file_path, symbol_name, symbol_type, line_start, line_end, chunk_text, embedding
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
                embedding: row.get(7)?,
            })
        })?;

        let mut results: Vec<SearchResult> = Vec::new();
        for row in rows {
            let chunk = row?;
            let chunk_embedding: Vec<f32> = unpack_embedding(&chunk.embedding);
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
}

#[cfg(test)]
fn is_supported(file_path: &str) -> bool {
    ai_agent_workspace_code_intelligence::is_supported(file_path)
}

/// Pack an embedding vector into a flat little-endian f32 byte buffer for BLOB storage.
fn pack_embedding(embedding: &[f32]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(embedding.len() * 4);
    for f in embedding {
        buf.extend_from_slice(&f.to_le_bytes());
    }
    buf
}

/// Reverse of [`pack_embedding`]: reinterpret a little-endian f32 byte buffer as a vector.
fn unpack_embedding(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
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
    fn test_pack_unpack_embedding_roundtrip() {
        let original = vec![1.0f32, -0.5, 3.1415, 0.0, -123.456];
        let packed = pack_embedding(&original);
        assert_eq!(packed.len(), original.len() * 4);
        let unpacked = unpack_embedding(&packed);
        assert_eq!(original, unpacked);
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
