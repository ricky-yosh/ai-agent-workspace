import type { ThemeDefinition } from './tokens';
import { TOKENS as T } from './tokens';

export const lightTheme: ThemeDefinition = {
  // Backgrounds — reversed lightness
  [T.BG_CANVAS]: 'oklch(0.965 0.002 286.000)',
  [T.BG_PRIMARY]: 'oklch(0.990 0.001 286.000)',
  [T.BG_SECONDARY]: 'oklch(0.970 0.002 286.000)',
  [T.BG_PANEL]: 'oklch(0.980 0.001 286.000)',
  [T.BG_PANEL_RAISED]: 'oklch(1.000 0.000 0.000)',
  [T.BG_ACTIVE]: 'oklch(0.935 0.005 286.000)',
  [T.BG_HOVER]: 'oklch(0.950 0.003 286.000)',
  [T.BG_INPUT]: 'oklch(1.000 0.000 0.000)',
  [T.BG_INPUT_HOVER]: 'oklch(0.970 0.002 286.000)',
  [T.BG_ELEVATED]: 'oklch(1.000 0.000 0.000)',

  // Text — dark on light
  [T.TEXT_PRIMARY]: 'oklch(0.220 0.002 286.000)',
  [T.TEXT_SECONDARY]: 'oklch(0.400 0.002 286.000)',
  [T.TEXT_MUTED]: 'oklch(0.450 0.002 286.000)',
  [T.TEXT_DIM]: 'oklch(0.400 0.002 286.000)',
  [T.TEXT_ON_ACCENT]: 'oklch(1.000 0.000 0.000)',
  [T.TEXT_ON_DANGER]: 'oklch(1.000 0.000 0.000)',

  // Borders
  [T.BORDER]: 'oklch(0.880 0.003 286.000)',
  [T.BORDER_SUBTLE]: 'oklch(0.920 0.002 286.000)',

  // Accent — keep blue hue
  [T.ACCENT]: 'oklch(0.568 0.167 251.313)',
  [T.ACCENT_HOVER]: 'oklch(0.500 0.167 251.313)',
  [T.ACCENT_SUBTLE]: 'oklch(0.935 0.035 251.313)',

  // Danger
  [T.DANGER]: 'oklch(0.568 0.200 26.406)',
  [T.DANGER_HOVER]: 'oklch(0.502 0.189 27.482)',
  [T.DANGER_SUBTLE]: 'oklch(0.950 0.025 26.406)',

  // Status
  [T.STATUS_RUNNING]: 'oklch(0.580 0.145 144.208)',
  [T.STATUS_PAUSED]: 'oklch(0.680 0.160 64.054)',
  [T.STATUS_MISSING]: 'oklch(0.560 0.195 28.806)',

  // Diff (git)
  [T.DIFF_ADD_BG]: 'rgba(46, 160, 67, 0.15)',
  [T.DIFF_ADD_TEXT]: '#3fb950',
  [T.DIFF_DEL_BG]: 'rgba(248, 81, 73, 0.15)',
  [T.DIFF_DEL_TEXT]: '#f85149',

  // Confirmed / Success
  [T.CONFIRMED_BG]: 'rgba(34, 197, 94, 0.12)',
  [T.CONFIRMED_COLOR]: 'rgb(134, 239, 172)',

  // Canvas — aligned to app's blue accent (hue 251°)
  [T.CANVAS_BG]: 'oklch(0.965 0.002 286.000)',
  [T.CANVAS_NODE_BG]: 'oklch(1.000 0.000 0.000)',
  [T.CANVAS_NODE_BORDER]: 'oklch(0.500 0.160 251.000 / 0.25)',
  [T.CANVAS_NODE_SELECTED]: 'oklch(0.600 0.200 251.000)',
  [T.CANVAS_EDGE]: 'oklch(0.500 0.140 251.000)',
  [T.CANVAS_ACCENT]: 'oklch(0.500 0.180 251.313)',
  [T.CANVAS_ACCENT_BRIGHT]: 'oklch(0.350 0.140 251.000)',

  // Syntax
  [T.SYNTAX_FG]: 'oklch(0.220 0.002 286.000)',
  [T.SYNTAX_BG]: 'oklch(0.990 0.001 286.000)',
  [T.SYNTAX_COMMENT]: 'oklch(0.530 0.002 286.000)',
  [T.SYNTAX_KEYWORD]: 'oklch(0.480 0.170 300.000)',
  [T.SYNTAX_STRING]: 'oklch(0.450 0.140 144.000)',
  [T.SYNTAX_FUNCTION]: 'oklch(0.500 0.160 251.313)',
  [T.SYNTAX_TYPE]: 'oklch(0.470 0.120 200.000)',
  [T.SYNTAX_NUMBER]: 'oklch(0.580 0.160 30.000)',
  [T.SYNTAX_ERROR]: 'oklch(0.560 0.195 28.806)',

  // Terminal
  [T.TERM_BG]: 'oklch(0.990 0.001 286.000)',
  [T.TERM_FG]: 'oklch(0.220 0.002 286.000)',
  [T.TERM_CURSOR]: 'oklch(0.220 0.002 286.000)',
  [T.TERM_SELECTION]: 'oklch(0.880 0.035 251.313)',

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
  [T.FONT_SIZE_2XL]: '20px',
  [T.FONT_FAMILY_SANS]: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
  [T.FONT_FAMILY_MONO]: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`,
  [T.FONT_FAMILY_UI]: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
  [T.LINE_HEIGHT_TIGHT]: '1.2',
  [T.LINE_HEIGHT_NORMAL]: '1.5',
  [T.LINE_HEIGHT_RELAXED]: '1.6',

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
  [T.SHADOW_ISLAND]: '0 1px 4px rgba(0,0,0,0.1), 0 0 1px rgba(0,0,0,0.1)',
  [T.NOISE_IMG]: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
  [T.NOISE_OPACITY]: '0.03',
  [T.NOISE_BLEND]: 'multiply',
};
