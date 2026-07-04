use rusqlite::params;
use serde::{Deserialize, Serialize};
use tree_sitter::{Language, Node, Parser};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SymbolType {
    Definition,
    Reference,
    Import,
    Call,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedSymbol {
    pub symbol_name: String,
    pub symbol_type: SymbolType,
    pub line_number: usize,
    pub end_line_number: Option<usize>,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexEntry {
    pub id: String,
    pub repo_path: String,
    pub file_path: String,
    pub symbol_name: String,
    pub symbol_type: String,
    pub line_number: i32,
    pub end_line_number: Option<i32>,
    pub data_json: Option<String>,
}

pub struct CodeIndexer;

impl CodeIndexer {
    pub fn new() -> Self {
        Self
    }

    pub fn fingerprint(content: &str) -> String {
        blake3::hash(content.as_bytes()).to_hex().to_string()
    }

    pub fn parse_file(&self, file_path: &str, content: &str) -> Vec<ExtractedSymbol> {
        let lang = match detect_language(file_path) {
            Some(l) => l,
            None => return vec![],
        };

        let mut parser = Parser::new();
        if parser.set_language(&lang).is_err() {
            return vec![];
        }

        let tree = match parser.parse(content, None) {
            Some(tree) => tree,
            None => return vec![],
        };

        let mut symbols = Vec::new();
        extract_symbols(tree.root_node(), content, &mut symbols);
        symbols
    }
}

fn detect_language(file_path: &str) -> Option<Language> {
    let ext = std::path::Path::new(file_path)
        .extension()?
        .to_str()?;
    match ext {
        "rs" => {
            let lang_fn = tree_sitter_rust::LANGUAGE;
            Some(lang_fn.into())
        }
        "ts" => {
            let lang_fn = tree_sitter_typescript::LANGUAGE_TYPESCRIPT;
            Some(lang_fn.into())
        }
        "tsx" => {
            let lang_fn = tree_sitter_typescript::LANGUAGE_TSX;
            Some(lang_fn.into())
        }
        _ => None,
    }
}

fn extract_symbols(node: Node, content: &str, symbols: &mut Vec<ExtractedSymbol>) {
    let node_type = node.kind();

    match node_type {
        "function_item" => {
            if let Some(name) = child_by_field(node, "name") {
                symbols.push(ExtractedSymbol {
                    symbol_name: node_text(name, content),
                    symbol_type: SymbolType::Definition,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "kind": "function" })),
                });
            }
        }
        "struct_item" => {
            if let Some(name) = child_by_field(node, "name") {
                symbols.push(ExtractedSymbol {
                    symbol_name: node_text(name, content),
                    symbol_type: SymbolType::Definition,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "kind": "struct" })),
                });
            }
        }
        "enum_item" => {
            if let Some(name) = child_by_field(node, "name") {
                symbols.push(ExtractedSymbol {
                    symbol_name: node_text(name, content),
                    symbol_type: SymbolType::Definition,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "kind": "enum" })),
                });
            }
        }
        "trait_item" => {
            if let Some(name) = child_by_field(node, "name") {
                symbols.push(ExtractedSymbol {
                    symbol_name: node_text(name, content),
                    symbol_type: SymbolType::Definition,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "kind": "trait" })),
                });
            }
        }
        "impl_item" => {
            let type_node = child_by_field(node, "type");
            let type_name = type_node.map(|n| node_text(n, content)).unwrap_or_default();
            symbols.push(ExtractedSymbol {
                symbol_name: format!("impl {}", type_name),
                symbol_type: SymbolType::Definition,
                line_number: node.start_position().row + 1,
                end_line_number: Some(node.end_position().row + 1),
                data: Some(serde_json::json!({ "kind": "impl" })),
            });
        }
        "use_declaration" => {
            let full_text = node_text(node, content);
            let cleaned = full_text
                .strip_prefix("use ")
                .unwrap_or(&full_text)
                .strip_suffix(';')
                .unwrap_or(&full_text);
            let segments: Vec<&str> = cleaned.split("::").collect();
            let name = segments.last().unwrap_or(&cleaned);
            let clean_name = name.trim().trim_end_matches('{').trim();
            if !clean_name.is_empty() {
                symbols.push(ExtractedSymbol {
                    symbol_name: clean_name.to_string(),
                    symbol_type: SymbolType::Import,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "path": cleaned.trim() })),
                });
            }
        }
        "call_expression" | "macro_invocation" => {
            let func_node = child_by_field(node, "function");
            if let Some(fnode) = func_node {
                let name = node_text(fnode, content);
                if !name.is_empty() {
                    symbols.push(ExtractedSymbol {
                        symbol_name: name,
                        symbol_type: SymbolType::Call,
                        line_number: node.start_position().row + 1,
                        end_line_number: None,
                        data: None,
                    });
                }
            } else {
                let name = node_text(node, content);
                let macro_name = name.split('!').next().unwrap_or(&name).trim().to_string();
                if !macro_name.is_empty() {
                    symbols.push(ExtractedSymbol {
                        symbol_name: macro_name,
                        symbol_type: SymbolType::Call,
                        line_number: node.start_position().row + 1,
                        end_line_number: None,
                        data: Some(serde_json::json!({ "kind": "macro_invocation" })),
                    });
                }
            }
        }
        "function_declaration" => {
            if let Some(name) = child_by_field(node, "name") {
                symbols.push(ExtractedSymbol {
                    symbol_name: node_text(name, content),
                    symbol_type: SymbolType::Definition,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "kind": "function" })),
                });
            }
        }
        "class_declaration" => {
            if let Some(name) = child_by_field(node, "name") {
                symbols.push(ExtractedSymbol {
                    symbol_name: node_text(name, content),
                    symbol_type: SymbolType::Definition,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "kind": "class" })),
                });
            }
        }
        "interface_declaration" => {
            if let Some(name) = child_by_field(node, "name") {
                symbols.push(ExtractedSymbol {
                    symbol_name: node_text(name, content),
                    symbol_type: SymbolType::Definition,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "kind": "interface" })),
                });
            }
        }
        "import_statement" => {
            let full_text = node_text(node, content);
            let name = full_text
                .split("from")
                .next()
                .unwrap_or(&full_text)
                .trim()
                .trim_start_matches("import")
                .trim()
                .trim_start_matches('{')
                .trim_end_matches('}')
                .trim()
                .to_string();
            if !name.is_empty() {
                symbols.push(ExtractedSymbol {
                    symbol_name: name,
                    symbol_type: SymbolType::Import,
                    line_number: node.start_position().row + 1,
                    end_line_number: Some(node.end_position().row + 1),
                    data: Some(serde_json::json!({ "statement": full_text.trim() })),
                });
            }
        }
        "lexical_declaration" | "variable_declaration" => {
            extract_var_declarations(node, content, symbols);
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        extract_symbols(child, content, symbols);
    }
}

fn extract_var_declarations(node: Node, content: &str, symbols: &mut Vec<ExtractedSymbol>) {
    let mut cursor = node.walk();
    for child in node.named_children(&mut cursor) {
        if child.kind() == "variable_declarator" {
            if let Some(name) = child_by_field(child, "name") {
                let init = child_by_field(child, "value");
                let is_function = init.map(|i| {
                    i.kind() == "arrow_function"
                        || i.kind() == "function"
                        || i.kind() == "call_expression"
                }).unwrap_or(false);

                if is_function {
                    symbols.push(ExtractedSymbol {
                        symbol_name: node_text(name, content),
                        symbol_type: SymbolType::Definition,
                        line_number: node.start_position().row + 1,
                        end_line_number: Some(node.end_position().row + 1),
                        data: Some(serde_json::json!({ "kind": "function" })),
                    });
                }
            }
        }
    }
}

fn child_by_field<'a>(node: Node<'a>, field: &str) -> Option<Node<'a>> {
    node.child_by_field_name(field)
}

fn node_text<'a>(node: Node<'a>, content: &'a str) -> String {
    node.utf8_text(content.as_bytes())
        .unwrap_or("")
        .to_string()
}

pub struct IndexStore<'a> {
    conn: &'a rusqlite::Connection,
}

impl<'a> IndexStore<'a> {
    pub fn new(conn: &'a rusqlite::Connection) -> Self {
        Self { conn }
    }

    pub fn get_fingerprint(&self, repo_path: &str, file_path: &str) -> Option<String> {
        self.conn
            .query_row(
                "SELECT content_fingerprint FROM code_index WHERE repo_path = ?1 AND file_path = ?2 LIMIT 1",
                params![repo_path, file_path],
                |row| row.get(0),
            )
            .ok()
    }

    pub fn clear_file(&self, repo_path: &str, file_path: &str) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "DELETE FROM code_index WHERE repo_path = ?1 AND file_path = ?2",
            params![repo_path, file_path],
        )?;
        Ok(())
    }

    pub fn insert_symbols(
        &self,
        repo_path: &str,
        file_path: &str,
        fingerprint: &str,
        symbols: &[ExtractedSymbol],
    ) -> Result<(), rusqlite::Error> {
        let now = chrono::Utc::now().timestamp();
        for symbol in symbols {
            let id = uuid::Uuid::new_v4().to_string();
            let symbol_type_str = match symbol.symbol_type {
                SymbolType::Definition => "definition",
                SymbolType::Reference => "reference",
                SymbolType::Import => "import",
                SymbolType::Call => "call",
            };
            let data_json = symbol
                .data
                .as_ref()
                .map(|v| serde_json::to_string(v).unwrap_or_default());

            self.conn.execute(
                "INSERT INTO code_index (id, repo_path, file_path, symbol_name, symbol_type, line_number, end_line_number, content_fingerprint, data_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    id,
                    repo_path,
                    file_path,
                    symbol.symbol_name,
                    symbol_type_str,
                    symbol.line_number as i32,
                    symbol.end_line_number.map(|l| l as i32),
                    fingerprint,
                    data_json,
                    now,
                    now,
                ],
            )?;
        }
        Ok(())
    }

    pub fn search_by_keyword(
        &self,
        repo_path: &str,
        keyword: &str,
    ) -> Result<Vec<IndexEntry>, rusqlite::Error> {
        let pattern = format!("%{}%", keyword);
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_path, file_path, symbol_name, symbol_type, line_number, end_line_number, data_json
             FROM code_index WHERE repo_path = ?1 AND symbol_name LIKE ?2
             ORDER BY file_path, line_number",
        )?;
        let rows = stmt.query_map(params![repo_path, pattern], |row| {
            Ok(IndexEntry {
                id: row.get(0)?,
                repo_path: row.get(1)?,
                file_path: row.get(2)?,
                symbol_name: row.get(3)?,
                symbol_type: row.get(4)?,
                line_number: row.get(5)?,
                end_line_number: row.get(6)?,
                data_json: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn search_by_regex(
        &self,
        repo_path: &str,
        pattern: &str,
    ) -> Result<Vec<IndexEntry>, rusqlite::Error> {
        let re = regex::Regex::new(pattern)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let all = self.search_by_keyword(repo_path, "")?;
        Ok(all
            .into_iter()
            .filter(|e| re.is_match(&e.symbol_name))
            .collect())
    }

    pub fn find_definition(
        &self,
        repo_path: &str,
        symbol_name: &str,
    ) -> Result<Vec<IndexEntry>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_path, file_path, symbol_name, symbol_type, line_number, end_line_number, data_json
             FROM code_index WHERE repo_path = ?1 AND symbol_name = ?2 AND symbol_type = 'definition'
             ORDER BY file_path, line_number",
        )?;
        let rows = stmt.query_map(params![repo_path, symbol_name], |row| {
            Ok(IndexEntry {
                id: row.get(0)?,
                repo_path: row.get(1)?,
                file_path: row.get(2)?,
                symbol_name: row.get(3)?,
                symbol_type: row.get(4)?,
                line_number: row.get(5)?,
                end_line_number: row.get(6)?,
                data_json: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn find_references(
        &self,
        repo_path: &str,
        symbol_name: &str,
    ) -> Result<Vec<IndexEntry>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_path, file_path, symbol_name, symbol_type, line_number, end_line_number, data_json
             FROM code_index WHERE repo_path = ?1 AND symbol_name = ?2 AND symbol_type IN ('reference', 'call', 'import')
             ORDER BY file_path, line_number",
        )?;
        let rows = stmt.query_map(params![repo_path, symbol_name], |row| {
            Ok(IndexEntry {
                id: row.get(0)?,
                repo_path: row.get(1)?,
                file_path: row.get(2)?,
                symbol_name: row.get(3)?,
                symbol_type: row.get(4)?,
                line_number: row.get(5)?,
                end_line_number: row.get(6)?,
                data_json: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn find_callers(
        &self,
        repo_path: &str,
        symbol_name: &str,
    ) -> Result<Vec<IndexEntry>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_path, file_path, symbol_name, symbol_type, line_number, end_line_number, data_json
             FROM code_index WHERE repo_path = ?1 AND symbol_name = ?2 AND symbol_type = 'call'
             ORDER BY file_path, line_number",
        )?;
        let rows = stmt.query_map(params![repo_path, symbol_name], |row| {
            Ok(IndexEntry {
                id: row.get(0)?,
                repo_path: row.get(1)?,
                file_path: row.get(2)?,
                symbol_name: row.get(3)?,
                symbol_type: row.get(4)?,
                line_number: row.get(5)?,
                end_line_number: row.get(6)?,
                data_json: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn find_callees(
        &self,
        repo_path: &str,
        file_path: &str,
        symbol_name: &str,
    ) -> Result<Vec<IndexEntry>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_path, file_path, symbol_name, symbol_type, line_number, end_line_number, data_json
             FROM code_index WHERE repo_path = ?1 AND file_path = ?2 AND symbol_name = ?3 AND symbol_type = 'call'
             ORDER BY line_number",
        )?;
        let rows = stmt.query_map(params![repo_path, file_path, symbol_name], |row| {
            Ok(IndexEntry {
                id: row.get(0)?,
                repo_path: row.get(1)?,
                file_path: row.get(2)?,
                symbol_name: row.get(3)?,
                symbol_type: row.get(4)?,
                line_number: row.get(5)?,
                end_line_number: row.get(6)?,
                data_json: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn list_files(&self, repo_path: &str) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT file_path FROM code_index WHERE repo_path = ?1 ORDER BY file_path",
        )?;
        let rows = stmt.query_map(params![repo_path], |row| row.get(0))?;
        rows.collect()
    }

    pub fn list_all_entries(&self, repo_path: &str, scope: Option<&str>) -> Result<Vec<IndexEntry>, rusqlite::Error> {
        let mut entries = Vec::new();
        if let Some(scope_prefix) = scope {
            let pattern = format!("{}%", scope_prefix.trim_end_matches('/'));
            let mut stmt = self.conn.prepare(
                "SELECT id, repo_path, file_path, symbol_name, symbol_type, line_number, end_line_number, data_json
                 FROM code_index WHERE repo_path = ?1 AND file_path LIKE ?2
                 ORDER BY file_path, line_number",
            )?;
            let rows = stmt.query_map(params![repo_path, pattern], |row| {
                Ok(IndexEntry {
                    id: row.get(0)?,
                    repo_path: row.get(1)?,
                    file_path: row.get(2)?,
                    symbol_name: row.get(3)?,
                    symbol_type: row.get(4)?,
                    line_number: row.get(5)?,
                    end_line_number: row.get(6)?,
                    data_json: row.get(7)?,
                })
            })?;
            for row in rows {
                entries.push(row?);
            }
        } else {
            let mut stmt = self.conn.prepare(
                "SELECT id, repo_path, file_path, symbol_name, symbol_type, line_number, end_line_number, data_json
                 FROM code_index WHERE repo_path = ?1
                 ORDER BY file_path, line_number",
            )?;
            let rows = stmt.query_map(params![repo_path], |row| {
                Ok(IndexEntry {
                    id: row.get(0)?,
                    repo_path: row.get(1)?,
                    file_path: row.get(2)?,
                    symbol_name: row.get(3)?,
                    symbol_type: row.get(4)?,
                    line_number: row.get(5)?,
                    end_line_number: row.get(6)?,
                    data_json: row.get(7)?,
                })
            })?;
            for row in rows {
                entries.push(row?);
            }
        }
        Ok(entries)
    }
}

fn is_supported(file_path: &str) -> bool {
    matches!(
        std::path::Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str()),
        Some("rs" | "ts" | "tsx" | "js" | "jsx")
    )
}

pub fn ensure_indexed(
    conn: &rusqlite::Connection,
    repo_path: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let store = IndexStore::new(conn);
    let indexer = CodeIndexer::new();

    for entry in WalkDir::new(repo_path) {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let relative = path.strip_prefix(repo_path).unwrap_or(path);
        let file_path = relative.to_string_lossy().to_string();

        if !is_supported(&file_path) {
            continue;
        }

        let content = std::fs::read_to_string(path)?;
        let fingerprint = CodeIndexer::fingerprint(&content);

        if let Some(stored) = store.get_fingerprint(repo_path, &file_path) {
            if stored == fingerprint {
                continue;
            }
        }

        store.clear_file(repo_path, &file_path)?;
        let symbols = indexer.parse_file(&file_path, &content);
        store.insert_symbols(repo_path, &file_path, &fingerprint, &symbols)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_conn() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE IF NOT EXISTS code_index (
            id TEXT PRIMARY KEY,
            repo_path TEXT NOT NULL,
            file_path TEXT NOT NULL,
            symbol_name TEXT NOT NULL,
            symbol_type TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            end_line_number INTEGER,
            content_fingerprint TEXT NOT NULL,
            data_json TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );").unwrap();
        conn
    }

    #[test]
    fn test_content_fingerprint() {
        let a = CodeIndexer::fingerprint("hello world");
        let b = CodeIndexer::fingerprint("hello world");
        let c = CodeIndexer::fingerprint("different content");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn test_parse_rust_functions() {
        let indexer = CodeIndexer::new();
        let source = r#"
fn main() {
    let x = 1;
}

fn add(a: i32, b: i32) -> i32 {
    a + b
}
"#;
        let symbols = indexer.parse_file("test.rs", source);
        let defs: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Definition)
            .collect();
        assert!(defs.iter().any(|s| s.symbol_name == "main"));
        assert!(defs.iter().any(|s| s.symbol_name == "add"));
        assert_eq!(defs.len(), 2);
    }

    #[test]
    fn test_parse_rust_structs() {
        let indexer = CodeIndexer::new();
        let source = r#"
struct Point {
    x: f64,
    y: f64,
}

struct Config {
    name: String,
}
"#;
        let symbols = indexer.parse_file("test.rs", source);
        let defs: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Definition)
            .collect();
        assert!(defs.iter().any(|s| s.symbol_name == "Point"));
        assert!(defs.iter().any(|s| s.symbol_name == "Config"));
    }

    #[test]
    fn test_parse_rust_use_statements() {
        let indexer = CodeIndexer::new();
        let source = r#"
use std::collections::HashMap;
use crate::module::Item;
"#;
        let symbols = indexer.parse_file("test.rs", source);
        let imports: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Import)
            .collect();
        assert!(imports.iter().any(|s| s.symbol_name == "HashMap"));
        assert!(imports.iter().any(|s| s.symbol_name == "Item"));
    }

    #[test]
    fn test_parse_rust_call_expressions() {
        let indexer = CodeIndexer::new();
        let source = r#"
fn main() {
    let v = vec![1, 2, 3];
    let len = v.len();
    println!("{}", len);
}
"#;
        let symbols = indexer.parse_file("test.rs", source);
        let calls: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Call)
            .collect();
        assert!(calls.iter().any(|s| s.symbol_name == "vec"), "expected 'vec' in calls: {:?}", calls.iter().map(|s| &s.symbol_name).collect::<Vec<_>>());
        assert!(calls.iter().any(|s| s.symbol_name == "println"), "expected 'println' in calls: {:?}", calls.iter().map(|s| &s.symbol_name).collect::<Vec<_>>());
        assert!(calls.iter().any(|s| s.symbol_name == "v.len"), "expected 'v.len' in calls: {:?}", calls.iter().map(|s| &s.symbol_name).collect::<Vec<_>>());
    }

    #[test]
    fn test_parse_typescript_functions() {
        let indexer = CodeIndexer::new();
        let source = r#"
function greet(name: string): void {
    console.log(name);
}

function add(a: number, b: number): number {
    return a + b;
}
"#;
        let symbols = indexer.parse_file("test.ts", source);
        let defs: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Definition)
            .collect();
        assert!(defs.iter().any(|s| s.symbol_name == "greet"));
        assert!(defs.iter().any(|s| s.symbol_name == "add"));
    }

    #[test]
    fn test_parse_typescript_imports() {
        let indexer = CodeIndexer::new();
        let source = r#"
import { useState } from 'react';
import fs from 'fs';
"#;
        let symbols = indexer.parse_file("test.ts", source);
        let imports: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Import)
            .collect();
        assert!(!imports.is_empty());
    }

    #[test]
    fn test_index_store_roundtrip() {
        let conn = test_conn();
        let store = IndexStore::new(&conn);
        let symbols = vec![
            ExtractedSymbol {
                symbol_name: "my_func".into(),
                symbol_type: SymbolType::Definition,
                line_number: 10,
                end_line_number: Some(20),
                data: Some(serde_json::json!({ "kind": "function" })),
            },
            ExtractedSymbol {
                symbol_name: "other_func".into(),
                symbol_type: SymbolType::Call,
                line_number: 5,
                end_line_number: None,
                data: None,
            },
        ];
        let fp = "abc123";
        store.insert_symbols("/repo", "src/main.rs", fp, &symbols).unwrap();

        assert_eq!(store.get_fingerprint("/repo", "src/main.rs").as_deref(), Some(fp));

        let results = store.search_by_keyword("/repo", "my_func").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].symbol_name, "my_func");
        assert_eq!(results[0].symbol_type, "definition");

        let results = store.find_definition("/repo", "my_func").unwrap();
        assert_eq!(results.len(), 1);

        let results = store.find_references("/repo", "other_func").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].symbol_type, "call");

        let files = store.list_files("/repo").unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0], "src/main.rs");

        store.clear_file("/repo", "src/main.rs").unwrap();
        let results = store.search_by_keyword("/repo", "my_func").unwrap();
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_incremental_indexing() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_str().unwrap();
        let file_path = "src/test.rs";

        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(
            dir.path().join(file_path),
            "fn hello() { }\n",
        )
        .unwrap();

        let conn = test_conn();
        ensure_indexed(&conn, repo_path).unwrap();

        let store = IndexStore::new(&conn);
        let fp1 = store.get_fingerprint(repo_path, file_path).unwrap();
        let count1 = store.search_by_keyword(repo_path, "hello").unwrap().len();
        assert_eq!(count1, 1);

        std::fs::write(
            dir.path().join(file_path),
            "fn hello() { }\nfn world() { }\n",
        )
        .unwrap();

        ensure_indexed(&conn, repo_path).unwrap();

        let fp2 = store.get_fingerprint(repo_path, file_path).unwrap();
        assert_ne!(fp1, fp2);

        let results = store.search_by_keyword(repo_path, "hello").unwrap();
        assert_eq!(results.len(), 1);
        let results = store.search_by_keyword(repo_path, "world").unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_incremental_skips_unchanged() {
        let dir = TempDir::new().unwrap();
        let repo_path = dir.path().to_str().unwrap();
        let file_path = "src/lib.rs";

        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(
            dir.path().join(file_path),
            "fn alpha() { }\n",
        )
        .unwrap();

        let conn = test_conn();
        ensure_indexed(&conn, repo_path).unwrap();

        let store = IndexStore::new(&conn);
        let fp_before = store.get_fingerprint(repo_path, file_path).unwrap();

        ensure_indexed(&conn, repo_path).unwrap();

        let fp_after = store.get_fingerprint(repo_path, file_path).unwrap();
        assert_eq!(fp_before, fp_after);

        let results = store.search_by_keyword(repo_path, "alpha").unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn test_unsupported_files_ignored() {
        let indexer = CodeIndexer::new();
        let symbols = indexer.parse_file("data.json", r#"{"key": "value"}"#);
        assert!(symbols.is_empty());
    }

    #[test]
    fn test_parse_rust_enums_and_traits() {
        let indexer = CodeIndexer::new();
        let source = r#"
enum Direction {
    North,
    South,
}

trait Drawable {
    fn draw(&self);
}
"#;
        let symbols = indexer.parse_file("test.rs", source);
        let defs: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Definition)
            .collect();
        assert!(defs.iter().any(|s| s.symbol_name == "Direction"));
        assert!(defs.iter().any(|s| s.symbol_name == "Drawable"));
    }

    #[test]
    fn test_parse_rust_impl_block() {
        let indexer = CodeIndexer::new();
        let source = r#"
struct Foo;

impl Foo {
    fn method(&self) {}
}
"#;
        let symbols = indexer.parse_file("test.rs", source);
        let defs: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Definition)
            .collect();
        assert!(defs.iter().any(|s| s.symbol_name == "Foo"));
        assert!(defs.iter().any(|s| s.symbol_name.contains("impl")));
    }

    #[test]
    fn test_parse_typescript_class() {
        let indexer = CodeIndexer::new();
        let source = r#"
class Animal {
    name: string;
    constructor(name: string) {
        this.name = name;
    }
}
"#;
        let symbols = indexer.parse_file("test.ts", source);
        let defs: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Definition)
            .collect();
        assert!(defs.iter().any(|s| s.symbol_name == "Animal"));
    }

    #[test]
    fn test_parse_typescript_interface() {
        let indexer = CodeIndexer::new();
        let source = r#"
interface User {
    name: string;
    age: number;
}
"#;
        let symbols = indexer.parse_file("test.ts", source);
        let defs: Vec<&ExtractedSymbol> = symbols
            .iter()
            .filter(|s| s.symbol_type == SymbolType::Definition)
            .collect();
        assert!(defs.iter().any(|s| s.symbol_name == "User"));
    }

    #[test]
    fn test_find_callers_and_callees() {
        let conn = test_conn();
        let store = IndexStore::new(&conn);
        let symbols = vec![
            ExtractedSymbol {
                symbol_name: "caller_func".into(),
                symbol_type: SymbolType::Call,
                line_number: 15,
                end_line_number: None,
                data: None,
            },
            ExtractedSymbol {
                symbol_name: "target".into(),
                symbol_type: SymbolType::Call,
                line_number: 3,
                end_line_number: None,
                data: None,
            },
        ];
        store.insert_symbols("/repo", "src/a.rs", "fp1", &symbols).unwrap();

        let callers = store.find_callers("/repo", "target").unwrap();
        assert_eq!(callers.len(), 1);
        assert_eq!(callers[0].file_path, "src/a.rs");
        assert_eq!(callers[0].line_number, 3);
    }

    #[test]
    fn test_list_all_entries() {
        let conn = test_conn();
        let store = IndexStore::new(&conn);
        let symbols = vec![
            ExtractedSymbol {
                symbol_name: "func_a".into(),
                symbol_type: SymbolType::Definition,
                line_number: 1,
                end_line_number: Some(5),
                data: Some(serde_json::json!({ "kind": "function" })),
            },
            ExtractedSymbol {
                symbol_name: "func_b".into(),
                symbol_type: SymbolType::Definition,
                line_number: 10,
                end_line_number: Some(15),
                data: Some(serde_json::json!({ "kind": "function" })),
            },
        ];
        store.insert_symbols("/repo", "src/auth.rs", "fp1", &symbols).unwrap();
        let symbols2 = vec![
            ExtractedSymbol {
                symbol_name: "handle".into(),
                symbol_type: SymbolType::Definition,
                line_number: 1,
                end_line_number: Some(3),
                data: Some(serde_json::json!({ "kind": "function" })),
            },
        ];
        store.insert_symbols("/repo", "src/api.rs", "fp2", &symbols2).unwrap();

        let all = store.list_all_entries("/repo", None).unwrap();
        assert_eq!(all.len(), 3);

        let scoped = store.list_all_entries("/repo", Some("src/auth")).unwrap();
        assert_eq!(scoped.len(), 2);
        assert!(scoped.iter().all(|e| e.file_path.starts_with("src/auth")));
    }
}
