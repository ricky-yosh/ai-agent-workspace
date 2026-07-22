import { createHighlighter, type Highlighter } from "shiki";
import { BUNDLED_LANGUAGES } from "./languageRegistry";
import type { ThemeName } from "../themes";

// ---------------------------------------------------------------------------
// Shared Shiki highlighter singleton
// ---------------------------------------------------------------------------

let highlighterPromise: Promise<Highlighter> | null = null;

let currentThemeName: ThemeName = "dark";

const THEME_MAP: Record<ThemeName, string> = {
  dark: "github-dark",
  light: "github-light",
  catppuccin: "catppuccin-mocha",
};

/**
 * Lazily create (and cache) the Shiki highlighter instance.
 * Loads all bundled languages and all theme variants on first use.
 * Shared across CodeRenderer and DiffRenderer to avoid duplicate instances.
 */
export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light", "catppuccin-mocha"],
      langs: BUNDLED_LANGUAGES,
    });
  }
  return highlighterPromise;
}

/**
 * Returns the current Shiki theme name based on the active app theme.
 */
export function getShikiTheme(): string {
  return THEME_MAP[currentThemeName];
}

/**
 * Updates the current Shiki theme. Call this when the app theme changes.
 * Note: the highlighter already has all themes loaded, so no reload needed.
 */
export function setShikiTheme(name: ThemeName): void {
  currentThemeName = name;
}
