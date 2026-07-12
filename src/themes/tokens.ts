export const TOKENS = {
  // Backgrounds
  BG_CANVAS: '--bg-canvas',
  BG_PRIMARY: '--bg-primary',
  BG_SECONDARY: '--bg-secondary',
  BG_PANEL: '--bg-panel',
  BG_PANEL_RAISED: '--bg-panel-raised',
  BG_ACTIVE: '--bg-active',
  BG_HOVER: '--bg-hover',
  BG_INPUT: '--bg-input',
  BG_INPUT_HOVER: '--bg-input-hover',
  BG_ELEVATED: '--bg-elevated',

  // Text
  TEXT_PRIMARY: '--text-primary',
  TEXT_SECONDARY: '--text-secondary',
  TEXT_MUTED: '--text-muted',
  TEXT_DIM: '--text-dim',
  TEXT_ON_ACCENT: '--text-on-accent',
  TEXT_ON_DANGER: '--text-on-danger',

  // Borders
  BORDER: '--border',
  BORDER_SUBTLE: '--border-subtle',

  // Accent
  ACCENT: '--accent',
  ACCENT_HOVER: '--accent-hover',
  ACCENT_SUBTLE: '--accent-subtle',

  // Danger
  DANGER: '--danger',
  DANGER_HOVER: '--danger-hover',
  DANGER_SUBTLE: '--danger-subtle',

  // Status
  STATUS_RUNNING: '--status-running',
  STATUS_PAUSED: '--status-paused',
  STATUS_MISSING: '--status-missing',

  // Diff (git)
  DIFF_ADD_BG: '--diff-add-bg',
  DIFF_ADD_TEXT: '--diff-add-text',
  DIFF_DEL_BG: '--diff-del-bg',
  DIFF_DEL_TEXT: '--diff-del-text',

  // Confirmed / Success
  CONFIRMED_BG: '--confirmed-bg',
  CONFIRMED_COLOR: '--confirmed-color',

  // Canvas (visual canvas panel)
  CANVAS_BG: '--canvas-bg',
  CANVAS_NODE_BG: '--canvas-node-bg',
  CANVAS_NODE_BORDER: '--canvas-node-border',
  CANVAS_NODE_SELECTED: '--canvas-node-selected',
  CANVAS_EDGE: '--canvas-edge',
  CANVAS_ACCENT: '--canvas-accent',
  CANVAS_ACCENT_BRIGHT: '--canvas-accent-bright',

  // Syntax (shiki)
  SYNTAX_FG: '--syntax-fg',
  SYNTAX_BG: '--syntax-bg',
  SYNTAX_COMMENT: '--syntax-comment',
  SYNTAX_KEYWORD: '--syntax-keyword',
  SYNTAX_STRING: '--syntax-string',
  SYNTAX_FUNCTION: '--syntax-function',
  SYNTAX_TYPE: '--syntax-type',
  SYNTAX_NUMBER: '--syntax-number',
  SYNTAX_ERROR: '--syntax-error',

  // Terminal
  TERM_BG: '--term-bg',
  TERM_FG: '--term-fg',
  TERM_CURSOR: '--term-cursor',
  TERM_SELECTION: '--term-selection',

  // Spacing
  SPACE_1: '--space-1',
  SPACE_2: '--space-2',
  SPACE_3: '--space-3',
  SPACE_4: '--space-4',
  SPACE_5: '--space-5',
  SPACE_6: '--space-6',
  SPACE_7: '--space-7',
  SPACE_8: '--space-8',

  // Typography — font size
  FONT_SIZE_XS: '--font-size-xs',
  FONT_SIZE_SM: '--font-size-sm',
  FONT_SIZE_BASE: '--font-size-base',
  FONT_SIZE_LG: '--font-size-lg',
  FONT_SIZE_XL: '--font-size-xl',
  FONT_SIZE_2XL: '--font-size-2xl',

  // Typography — font weight
  FONT_WEIGHT_NORMAL: '--font-weight-normal',
  FONT_WEIGHT_MEDIUM: '--font-weight-medium',
  FONT_WEIGHT_SEMIBOLD: '--font-weight-semibold',
  FONT_WEIGHT_BOLD: '--font-weight-bold',

  // Typography — font family
  FONT_FAMILY_SANS: '--font-family-sans',
  FONT_FAMILY_MONO: '--font-family-mono',
  FONT_FAMILY_UI: '--font-family-ui',

  // Typography — line height
  LINE_HEIGHT_TIGHT: '--line-height-tight',
  LINE_HEIGHT_NORMAL: '--line-height-normal',
  LINE_HEIGHT_RELAXED: '--line-height-relaxed',

  // Radius
  RADIUS_SM: '--radius-sm',
  RADIUS_MD: '--radius-md',
  RADIUS_LG: '--radius-lg',
  RADIUS_FULL: '--radius-full',

  // Shadow
  SHADOW_SM: '--shadow-sm',
  SHADOW_MD: '--shadow-md',
  SHADOW_LG: '--shadow-lg',

  // Duration
  DURATION_FAST: '--duration-fast',
  DURATION_NORMAL: '--duration-normal',
  DURATION_SLOW: '--duration-slow',

  // Layout (non-color, keep as-is)
  GUTTER: '--gutter',
  RADIUS_ISLAND: '--radius-island',
  RADIUS_CONTROL: '--radius-control',
  SHADOW_ISLAND: '--shadow-island',
  NOISE_IMG: '--noise-img',
  NOISE_OPACITY: '--noise-opacity',
  NOISE_BLEND: '--noise-blend',
} as const;

export type TokenName = (typeof TOKENS)[keyof typeof TOKENS];
export type ThemeDefinition = Record<TokenName, string>;
