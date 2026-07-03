import { createHighlighter, type Highlighter } from "shiki";
import { BUNDLED_LANGUAGES } from "./languageRegistry";

// ---------------------------------------------------------------------------
// Shared Shiki highlighter singleton
// ---------------------------------------------------------------------------

let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Lazily create (and cache) the Shiki highlighter instance.
 * Loads all bundled languages on first use.
 * Shared across CodeRenderer and DiffRenderer to avoid duplicate instances.
 */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: BUNDLED_LANGUAGES,
    });
  }
  return highlighterPromise;
}
