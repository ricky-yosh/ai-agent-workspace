import { useState, useEffect, useMemo, useRef } from "react";
import { getHighlighter } from "../shikiSingleton";
import { fileContentCache, fnv1a } from "../cache";
import {
  languageForFile,
  type ShikiLanguageId,
} from "../languageRegistry";

// ---------------------------------------------------------------------------
// Cache helpers for highlighted HTML
// ---------------------------------------------------------------------------

const HIGHLIGHT_PREFIX = "highlight:";

/**
 * Attempt to retrieve cached highlighted HTML for a file.
 */
function getCachedHighlight(filePath: string, contentHash: string): string | null {
  const cacheKey = `${HIGHLIGHT_PREFIX}${contentHash}`;
  const entry = fileContentCache.get(filePath, cacheKey);
  return entry?.content ?? null;
}

/**
 * Store highlighted HTML in the LRU cache.
 */
function setCachedHighlight(
  filePath: string,
  contentHash: string,
  html: string,
): void {
  const cacheKey = `${HIGHLIGHT_PREFIX}${contentHash}`;
  fileContentCache.set(filePath, cacheKey, html, html.length);
}

// ---------------------------------------------------------------------------
// CodeRenderer component
// ---------------------------------------------------------------------------

export interface CodeRendererProps {
  /** The file path (used for cache keys and language detection). */
  filePath: string;
  /** The plain text content of the file. */
  content: string;
  /** Byte size of the file content. */
  size?: number;
}

/**
 * Renders code with Shiki syntax highlighting.
 *
 * Shows plain text immediately, then asynchronously replaces it with
 * highlighted HTML once the Shiki highlighter has processed the content.
 * Highlighted results are cached in the shared LRU cache keyed by content hash.
 */
export function CodeRenderer({ filePath, content, size }: CodeRendererProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [highlighting, setHighlighting] = useState(false);
  const requestIdRef = useRef(0);

  const contentHash = useMemo(() => fnv1a(content), [content]);
  const language: ShikiLanguageId | null = useMemo(
    () => languageForFile(filePath),
    [filePath],
  );

  // Attempt to hydrate from cache synchronously on mount / content change
  useEffect(() => {
    const cached = getCachedHighlight(filePath, contentHash);
    if (cached) {
      setHighlightedHtml(cached);
      return;
    }
  }, [filePath, contentHash]);

  // Async highlighting when we don't have a cached result
  useEffect(() => {
    if (highlightedHtml) return; // already have highlighted content

    if (!language) {
      // Unknown language — leave highlightedHtml null so plain text shows
      setHighlighting(false);
      return;
    }

    const thisRequest = ++requestIdRef.current;
    let cancelled = false;

    async function highlight() {
      setHighlighting(true);
      try {
        const highlighter = await getHighlighter();
        if (cancelled || thisRequest !== requestIdRef.current) return;

        const html = highlighter.codeToHtml(content, {
          lang: language!,
          theme: "github-light",
        });

        if (cancelled || thisRequest !== requestIdRef.current) return;

        setCachedHighlight(filePath, contentHash, html);
        setHighlightedHtml(html);
      } catch {
        // On error, fall back to plain text (leave highlightedHtml null)
      } finally {
        if (!cancelled) {
          setHighlighting(false);
        }
      }
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [filePath, content, contentHash, language, highlightedHtml]);

  // Reset highlighted HTML when content changes (to re-highlight)
  useEffect(() => {
    setHighlightedHtml(null);
  }, [contentHash]);

  // If we have highlighted HTML, render it
  if (highlightedHtml) {
    return (
      <div
        className="code-renderer"
        data-file-path={filePath}
        data-language={language ?? "plain"}
        data-size={size}
        data-highlighting="true"
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    );
  }

  // Plain text fallback (shown immediately, then replaced by highlighted HTML)
  return (
    <pre
      className="code-renderer"
      data-file-path={filePath}
      data-language={language ?? "plain"}
      data-size={size}
      data-highlighting={highlighting ? "pending" : "false"}
    >
      <code>{content}</code>
    </pre>
  );
}
