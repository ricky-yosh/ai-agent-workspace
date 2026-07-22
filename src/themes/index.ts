import { TOKENS } from './tokens';
import type { ThemeDefinition } from './tokens';
import { darkTheme } from './dark';
import { lightTheme } from './light';
import { catppuccinTheme } from './catppuccin';

export type ThemeName = 'dark' | 'light' | 'catppuccin';

const themes: Record<ThemeName, ThemeDefinition> = {
  dark: darkTheme,
  light: lightTheme,
  catppuccin: catppuccinTheme,
};

export function applyTheme(name: ThemeName): void {
  const theme = themes[name];
  if (!theme) return;
  const root = document.documentElement;
  for (const [token, value] of Object.entries(theme)) {
    root.style.setProperty(token, value);
  }
  // Set data attribute for CSS-based overrides (noise blend mode, etc.)
  root.setAttribute('data-theme', name);
}

export function getThemeNames(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}

export { TOKENS };
export type { ThemeDefinition };
