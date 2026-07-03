import { useMemo, useState, useEffect } from "react";
import { createHighlighter, type Highlighter } from "shiki";
import { BUNDLED_LANGUAGES, type ShikiLanguageId } from "../languageRegistry";

// ---------------------------------------------------------------------------
// Singleton Shiki highlighter (shared with CodeRenderer)
// ---------------------------------------------------------------------------

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: BUNDLED_LANGUAGES,
    });
  }
  return highlighterPromise;
}

// ---------------------------------------------------------------------------
// Diff line types
// ---------------------------------------------------------------------------

export type DiffLineType = "addition" | "deletion" | "context" | "hunk-header" | "file-header";

export interface DiffLine {
  /** The raw line content including the +/-/ prefix character. */
  raw: string;
  /** Content of the line with the leading type character stripped. */
  content: string;
  /** Classified line type. */
  type: DiffLineType;
  /** Old file line number (null for file/hunk headers and additions-only). */
  oldLineNum: number | null;
  /** New file line number (null for file/hunk headers and deletions-only). */
  newLineNum: number | null;
}

export interface DiffFile {
  /** Path of the file being diffed (from the "diff --git" header). */
  filePath: string;
  /** Lines in this file's diff section. */
  lines: DiffLine[];
}

// ---------------------------------------------------------------------------
// Unified diff parser
// ---------------------------------------------------------------------------

const DIFF_FILE_REGEX = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

/**
 * Parse a unified diff string into structured DiffFile objects.
 */
export function parseUnifiedDiff(rawDiff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  const lines = rawDiff.split("\n");

  for (const raw of lines) {
    // File header
    const fileMatch = raw.match(DIFF_FILE_REGEX);
    if (fileMatch) {
      currentFile = { filePath: fileMatch[2], lines: [] };
      files.push(currentFile);
      continue;
    }

    // Hunk header
    const hunkMatch = raw.match(HUNK_HEADER_REGEX);
    if (hunkMatch && currentFile) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      currentFile.lines.push({
        raw,
        content: hunkMatch[3].trim(),
        type: "hunk-header",
        oldLineNum: null,
        newLineNum: null,
      });
      continue;
    }

    // If we have a current file, classify the line
    if (currentFile) {
      // Check for diff metadata lines first (---, +++, index, new file, etc.)
      // These all look like they start with +/- but are file metadata
      if (raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("index ")) {
        currentFile.lines.push({
          raw,
          content: raw,
          type: "file-header",
          oldLineNum: null,
          newLineNum: null,
        });
      } else if (raw.startsWith("+")) {
        currentFile.lines.push({
          raw,
          content: raw.slice(1),
          type: "addition",
          oldLineNum: null,
          newLineNum: newLine++,
        });
      } else if (raw.startsWith("-")) {
        currentFile.lines.push({
          raw,
          content: raw.slice(1),
          type: "deletion",
          oldLineNum: oldLine++,
          newLineNum: null,
        });
      } else if (raw.startsWith(" ")) {
        // Context line (starts with a single space)
        currentFile.lines.push({
          raw,
          content: raw.slice(1),
          type: "context",
          oldLineNum: oldLine++,
          newLineNum: newLine++,
        });
      } else if (raw === "") {
        // Empty line between hunks — skip
      } else {
        // Other header lines (e.g., new file mode, old file mode, similarity)
        currentFile.lines.push({
          raw,
          content: raw,
          type: "file-header",
          oldLineNum: null,
          newLineNum: null,
        });
      }
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

const LINE_HEIGHT = 20;

const STYLES: Record<DiffLineType, React.CSSProperties> = {
  addition: {
    background: "rgba(46, 160, 67, 0.15)",
    color: "inherit",
  },
  deletion: {
    background: "rgba(248, 81, 73, 0.15)",
    color: "inherit",
  },
  context: {
    background: "transparent",
    color: "inherit",
  },
  "hunk-header": {
    background: "rgba(56, 132, 255, 0.08)",
    color: "var(--text-muted, #888)",
    fontStyle: "italic",
  },
  "file-header": {
    background: "rgba(56, 132, 255, 0.08)",
    color: "var(--text-muted, #888)",
    fontWeight: 600,
  },
};

const SIGN_STYLES: Record<"addition" | "deletion", React.CSSProperties> = {
  addition: { color: "#3fb950", fontWeight: 600, userSelect: "none" },
  deletion: { color: "#f85149", fontWeight: 600, userSelect: "none" },
};

// ---------------------------------------------------------------------------
// Highlighted line component
// ---------------------------------------------------------------------------

interface HighlightedDiffLineProps {
  content: string;
  language: ShikiLanguageId | null;
}

function HighlightedDiffLine({ content, language }: HighlightedDiffLineProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!language || !content.trim()) {
      setHtml(null);
      return;
    }

    let cancelled = false;

    async function highlight() {
      try {
        const highlighter = await getHighlighter();
        if (cancelled) return;
        const result = highlighter.codeToHtml(content, {
          lang: language as string,
          theme: "github-light",
        });
        if (!cancelled) setHtml(result);
      } catch {
        if (!cancelled) setHtml(null);
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [content, language]);

  if (html) {
    // Shiki wraps in <pre><code> — extract inner HTML to embed in our line div
    const inner = html.replace(/<\/?pre[^>]*>/g, "").replace(/<\/?code[^>]*>/g, "");
    return <span dangerouslySetInnerHTML={{ __html: inner }} />;
  }

  return <>{content}</>;
}

// ---------------------------------------------------------------------------
// DiffRenderer component
// ---------------------------------------------------------------------------

export interface DiffRendererProps {
  /** Raw unified diff output from git diff. */
  diffText: string;
  /** File extension for language detection (optional). */
  language?: ShikiLanguageId | null;
}

/**
 * Renders a unified diff with line-level coloring:
 * - Additions (+ lines) → green background
 * - Deletions (- lines) → red background
 * - Context lines → transparent
 * - Hunk/file headers → blue-tinted background
 *
 * Supports Shiki syntax highlighting for code content within diff lines.
 */
export function DiffRenderer({ diffText, language }: DiffRendererProps) {
  const files = useMemo(() => parseUnifiedDiff(diffText), [diffText]);

  if (files.length === 0) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted, #888)", fontSize: 13 }}>
        No changes to display.
      </div>
    );
  }

  return (
    <div className="diff-renderer" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, lineHeight: `${LINE_HEIGHT}px` }}>
      {files.map((file) => (
        <DiffFileSection key={file.filePath} file={file} language={language ?? null} />
      ))}
    </div>
  );
}

function DiffFileSection({ file, language }: { file: DiffFile; language: ShikiLanguageId | null }) {
  return (
    <div className="diff-file-section">
      <div
        className="diff-file-header"
        style={{
          ...STYLES["file-header"],
          padding: "4px 12px",
          borderBottom: "1px solid var(--border-color, #333)",
          position: "sticky",
          top: 0,
          zIndex: 1,
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 12,
        }}
      >
        {file.filePath}
      </div>
      {file.lines.map((line, idx) => (
        <DiffLineRow key={idx} line={line} language={language} />
      ))}
    </div>
  );
}

function DiffLineRow({ line, language }: { line: DiffLine; language: ShikiLanguageId | null }) {
  const isCodeLine = line.type === "addition" || line.type === "deletion" || line.type === "context";
  const signChar = line.type === "addition" ? "+" : line.type === "deletion" ? "-" : " ";

  return (
    <div
      className={`diff-line diff-line--${line.type}`}
      style={{
        ...STYLES[line.type],
        display: "flex",
        alignItems: "stretch",
        height: LINE_HEIGHT,
        whiteSpace: "pre",
        overflow: "hidden",
      }}
    >
      {/* Line numbers gutter */}
      <span
        style={{
          display: "inline-block",
          width: 50,
          minWidth: 50,
          textAlign: "right",
          paddingRight: 8,
          color: "var(--text-muted, #666)",
          userSelect: "none",
          overflow: "hidden",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {line.oldLineNum ?? ""}
      </span>
      <span
        style={{
          display: "inline-block",
          width: 50,
          minWidth: 50,
          textAlign: "right",
          paddingRight: 8,
          color: "var(--text-muted, #666)",
          userSelect: "none",
          overflow: "hidden",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {line.newLineNum ?? ""}
      </span>
      {/* Sign character (+/-/ ) */}
      {isCodeLine ? (
        <span style={SIGN_STYLES[line.type as "addition" | "deletion"] ?? { userSelect: "none", color: "var(--text-muted, #666)" }}>
          {signChar}
        </span>
      ) : (
        <span style={{ userSelect: "none" }}>{signChar}</span>
      )}
      {/* Content */}
      <span style={{ flex: 1, overflow: "hidden" }}>
        {isCodeLine && language ? (
          <HighlightedDiffLine content={line.content} language={language} />
        ) : (
          line.content
        )}
      </span>
    </div>
  );
}

export default DiffRenderer;
