/**
 * Maps file extensions to Shiki language IDs.
 *
 * Covers ~20 bundled languages for the initial file viewer.
 * Extensions are lowercase without the leading dot.
 */

export type ShikiLanguageId = string;

/**
 * File extension → Shiki language ID mapping.
 * Keyed by lowercase extension without the leading dot.
 */
const EXTENSION_TO_LANGUAGE: Record<string, ShikiLanguageId> = {
  // JavaScript / TypeScript
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",

  // Python
  py: "python",
  pyw: "python",

  // Rust
  rs: "rust",

  // Go
  go: "go",

  // Java
  java: "java",

  // C / C++
  c: "c",
  h: "c",
  cpp: "cpp",
  cxx: "cpp",
  cc: "cpp",
  hpp: "cpp",
  hxx: "cpp",

  // HTML
  html: "html",
  htm: "html",

  // CSS
  css: "css",
  scss: "scss",
  less: "less",

  // JSON
  json: "json",
  jsonc: "json",

  // YAML
  yml: "yaml",
  yaml: "yaml",

  // TOML
  toml: "toml",

  // Markdown
  md: "markdown",
  mdx: "markdown",

  // Shell / Bash
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",

  // Swift
  swift: "swift",

  // Objective-C
  m: "objective-c",
  mm: "objective-cpp",

  // Kotlin
  kt: "kotlin",
  kts: "kotlin",

  // C#
  cs: "csharp",

  // Ruby
  rb: "ruby",

  // PHP
  php: "php",

  // SQL
  sql: "sql",
};

/**
 * Languages to eagerly load into the Shiki highlighter.
 * These correspond to the values in EXTENSION_TO_LANGUAGE.
 */
export const BUNDLED_LANGUAGES: ShikiLanguageId[] = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "html",
  "css",
  "scss",
  "less",
  "json",
  "yaml",
  "toml",
  "markdown",
  "shellscript",
  "swift",
  "objective-c",
  "objective-cpp",
  "kotlin",
  "csharp",
  "ruby",
  "php",
  "sql",
];

/**
 * Look up the Shiki language ID for a file extension.
 *
 * @param extension  File extension without the leading dot (e.g. "ts", "py").
 * @returns The Shiki language ID, or `null` if not recognized.
 */
export function languageForExtension(extension: string): ShikiLanguageId | null {
  return EXTENSION_TO_LANGUAGE[extension.toLowerCase()] ?? null;
}

/**
 * Extract the file extension from a file path (without the leading dot).
 *
 * @param filePath  Full or relative file path.
 * @returns Lowercase extension, or empty string if none.
 */
export function extractExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filePath.length - 1) return "";
  return filePath.slice(lastDot + 1).toLowerCase();
}

/**
 * Determine the Shiki language ID for a given file path.
 *
 * @param filePath  Full or relative file path.
 * @returns The Shiki language ID, or `null` if not recognized.
 */
export function languageForFile(filePath: string): ShikiLanguageId | null {
  return languageForExtension(extractExtension(filePath));
}
