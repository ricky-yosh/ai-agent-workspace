import type { ThemeDefinition } from './tokens';
import { TOKENS as T } from './tokens';

// Catppuccin Mocha palette — https://catppuccin.com/palette
export const catppuccinTheme: ThemeDefinition = {
  // Backgrounds — Catppuccin base/mantle/crust
  [T.BG_CANVAS]: 'oklch(0.183 0.020 284.204)',       // #11111b (crust)
  [T.BG_PRIMARY]: 'oklch(0.243 0.030 283.911)',       // #1e1e2e (base)
  [T.BG_SECONDARY]: 'oklch(0.216 0.025 284.065)',     // #181825 (mantle)
  [T.BG_PANEL]: 'oklch(0.243 0.030 283.911)',         // #1e1e2e
  [T.BG_PANEL_RAISED]: 'oklch(0.324 0.032 281.978)',  // #313244 (surface 0)
  [T.BG_ACTIVE]: 'oklch(0.404 0.032 280.152)',        // #45475a (surface 1)
  [T.BG_HOVER]: 'oklch(0.324 0.032 281.978)',         // #313244
  [T.BG_INPUT]: 'oklch(0.404 0.032 280.152)',         // #45475a
  [T.BG_INPUT_HOVER]: 'oklch(0.477 0.034 278.643)',   // #585b70 (surface 2)
  [T.BG_ELEVATED]: 'oklch(0.324 0.032 281.978)',      // #313244

  // Text — Catppuccin text/subtext
  [T.TEXT_PRIMARY]: 'oklch(0.879 0.043 272.277)',      // #cdd6f4 (text)
  [T.TEXT_SECONDARY]: 'oklch(0.817 0.040 272.862)',   // #bac2de (subtext 0)
  [T.TEXT_MUTED]: 'oklch(0.550 0.034 277.095)',       // #6c7086 (overlay 2)
  [T.TEXT_DIM]: 'oklch(0.477 0.034 278.643)',         // #585b70 (surface 2)
  [T.TEXT_ON_ACCENT]: 'oklch(0.243 0.030 283.911)',   // dark text on pastel
  [T.TEXT_ON_DANGER]: 'oklch(0.243 0.030 283.911)',

  // Borders
  [T.BORDER]: 'oklch(0.404 0.032 280.152)',           // #45475a
  [T.BORDER_SUBTLE]: 'oklch(0.324 0.032 281.978)',    // #313244

  // Accent — Mauve
  [T.ACCENT]: 'oklch(0.787 0.119 304.769)',           // #cba6f7 (mauve)
  [T.ACCENT_HOVER]: 'oklch(0.820 0.119 304.769)',     // lighter mauve
  [T.ACCENT_SUBTLE]: 'oklch(0.320 0.060 304.769)',    // dark mauve bg

  // Danger — Red
  [T.DANGER]: 'oklch(0.756 0.130 2.764)',             // #f38ba8 (red)
  [T.DANGER_HOVER]: 'oklch(0.690 0.130 2.764)',       // darker red
  [T.DANGER_SUBTLE]: 'oklch(0.300 0.050 2.764)',      // dark red bg

  // Status
  [T.STATUS_RUNNING]: 'oklch(0.858 0.109 142.715)',   // #a6e3a1 (green)
  [T.STATUS_PAUSED]: 'oklch(0.824 0.101 52.629)',     // #fab387 (peach)
  [T.STATUS_MISSING]: 'oklch(0.756 0.130 2.764)',     // #f38ba8 (red)

  // Canvas
  [T.CANVAS_BG]: 'oklch(0.183 0.020 284.204)',        // #11111b
  [T.CANVAS_NODE_BG]: 'oklch(0.243 0.030 283.911)',   // #1e1e2e
  [T.CANVAS_NODE_BORDER]: 'oklch(0.787 0.119 304.769 / 0.33)',
  [T.CANVAS_NODE_SELECTED]: 'oklch(0.787 0.119 304.769)', // mauve
  [T.CANVAS_EDGE]: 'oklch(0.787 0.119 304.769)',      // mauve
  [T.CANVAS_ACCENT]: 'oklch(0.700 0.100 304.769)',    // muted mauve
  [T.CANVAS_ACCENT_BRIGHT]: 'oklch(0.840 0.080 304.769)', // light mauve

  // Syntax
  [T.SYNTAX_FG]: 'oklch(0.879 0.043 272.277)',
  [T.SYNTAX_BG]: 'oklch(0.243 0.030 283.911)',
  [T.SYNTAX_COMMENT]: 'oklch(0.477 0.034 278.643)',   // #585b70
  [T.SYNTAX_KEYWORD]: 'oklch(0.787 0.119 304.769)',   // mauve
  [T.SYNTAX_STRING]: 'oklch(0.858 0.109 142.715)',    // green
  [T.SYNTAX_FUNCTION]: 'oklch(0.766 0.111 259.885)',  // blue #89b4fa
  [T.SYNTAX_TYPE]: 'oklch(0.858 0.079 182.749)',      // teal #94e2d5
  [T.SYNTAX_NUMBER]: 'oklch(0.919 0.070 86.528)',     // yellow #f9e2af
  [T.SYNTAX_ERROR]: 'oklch(0.756 0.130 2.764)',       // red

  // Terminal
  [T.TERM_BG]: 'oklch(0.243 0.030 283.911)',
  [T.TERM_FG]: 'oklch(0.879 0.043 272.277)',
  [T.TERM_CURSOR]: 'oklch(0.879 0.043 272.277)',
  [T.TERM_SELECTION]: 'oklch(0.404 0.032 280.152)',

  // Spacing
  [T.SPACE_1]: '4px',
  [T.SPACE_2]: '8px',
  [T.SPACE_3]: '12px',
  [T.SPACE_4]: '16px',
  [T.SPACE_5]: '20px',
  [T.SPACE_6]: '24px',
  [T.SPACE_7]: '32px',
  [T.SPACE_8]: '48px',

  // Typography
  [T.FONT_SIZE_XS]: '11px',
  [T.FONT_SIZE_SM]: '12px',
  [T.FONT_SIZE_BASE]: '13px',
  [T.FONT_SIZE_LG]: '15px',
  [T.FONT_SIZE_XL]: '18px',
  [T.FONT_WEIGHT_NORMAL]: '400',
  [T.FONT_WEIGHT_MEDIUM]: '500',
  [T.FONT_WEIGHT_SEMIBOLD]: '600',
  [T.FONT_WEIGHT_BOLD]: '700',

  // Radius
  [T.RADIUS_SM]: '4px',
  [T.RADIUS_MD]: '6px',
  [T.RADIUS_LG]: '8px',
  [T.RADIUS_FULL]: '9999px',

  // Shadow
  [T.SHADOW_SM]: '0 1px 2px rgba(0,0,0,0.1)',
  [T.SHADOW_MD]: '0 2px 8px rgba(0,0,0,0.12)',
  [T.SHADOW_LG]: '0 4px 16px rgba(0,0,0,0.16)',

  // Duration
  [T.DURATION_FAST]: '100ms',
  [T.DURATION_NORMAL]: '200ms',
  [T.DURATION_SLOW]: '350ms',

  // Layout
  [T.GUTTER]: '8px',
  [T.RADIUS_ISLAND]: '8px',
  [T.RADIUS_CONTROL]: '6px',
  [T.SHADOW_ISLAND]: '0 1px 3px rgba(0,0,0,0.3)',
  [T.NOISE_IMG]: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
  [T.NOISE_OPACITY]: '0.07',
  [T.NOISE_BLEND]: 'screen',
};
