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
