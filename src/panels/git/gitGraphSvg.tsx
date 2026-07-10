import React from "react";

/** Lane width in pixels for each commit column. */
export const LANE_WIDTH = 16;

/** Row height in pixels for each commit row. */
export const ROW_HEIGHT = 24;

/** Commit dot radius in pixels. */
export const DOT_RADIUS = 4;

const colCenterX = (col: number): number => col * LANE_WIDTH + LANE_WIDTH / 2;
const DOT_CENTER_Y = ROW_HEIGHT / 2;
const LANE_STROKE_WIDTH = 1.5;
const LANE_OPACITY = 0.6;

/* ------------------------------------------------------------------ */
/*  Lane                                                              */
/* ------------------------------------------------------------------ */

interface LaneProps {
  /** 0-based column index */
  column: number;
  /** Whether the lane is active in this row (if false, renders nothing) */
  active: boolean;
  /** Stroke color for the lane line(s) */
  color: string;
  /** When true, splits the vertical line above/below the dot (used at branch/merge points) */
  hasGap: boolean;
}

/**
 * Renders vertical lane line(s) for a given column in a row.
 * - If `hasGap` is false: a single full-height `<line>`.
 * - If `hasGap` is true: two `<line>` segments (above and below the dot position).
 */
export const Lane: React.FC<LaneProps> = ({ column, active, color, hasGap }) => {
  if (!active) return null;

  const x = colCenterX(column);

  if (hasGap) {
    return (
      <>
        <line x1={x} y1={0} x2={x} y2={DOT_CENTER_Y - DOT_RADIUS} stroke={color} strokeWidth={LANE_STROKE_WIDTH} opacity={LANE_OPACITY} />
        <line x1={x} y1={DOT_CENTER_Y + DOT_RADIUS} x2={x} y2={ROW_HEIGHT} stroke={color} strokeWidth={LANE_STROKE_WIDTH} opacity={LANE_OPACITY} />
      </>
    );
  }

  return (
    <line x1={x} y1={0} x2={x} y2={ROW_HEIGHT} stroke={color} strokeWidth={LANE_STROKE_WIDTH} opacity={LANE_OPACITY} />
  );
};

/* ------------------------------------------------------------------ */
/*  Connector                                                         */
/* ------------------------------------------------------------------ */

interface ConnectorProps {
  /** Source column (where the connector originates) */
  fromCol: number;
  /** Target column (where the connector arrives) */
  toCol: number;
  /** Stroke color */
  color: string;
}

/**
 * Renders a cubic bezier connector between two columns, used for branch/merge
 * visualisation. The curve arcs from `fromCol` downward to `toCol`.
 */
export const Connector: React.FC<ConnectorProps> = ({ fromCol, toCol, color }) => {
  const fromX = colCenterX(fromCol);
  const toX = colCenterX(toCol);
  const curveStartY = DOT_CENTER_Y + DOT_RADIUS + 2;
  const d = `M ${fromX} ${curveStartY} C ${fromX} ${ROW_HEIGHT - 2} ${toX} 0 ${toX} ${ROW_HEIGHT - 2}`;

  return (
    <path d={d} fill="none" stroke={color} strokeWidth={LANE_STROKE_WIDTH} opacity={LANE_OPACITY} />
  );
};

/* ------------------------------------------------------------------ */
/*  Dot                                                               */
/* ------------------------------------------------------------------ */

interface DotProps {
  /** 0-based column index */
  column: number;
  /** Fill color */
  color: string;
}

/**
 * Renders the commit dot circle.
 */
export const Dot: React.FC<DotProps> = ({ column, color }) => {
  const cx = colCenterX(column);
  const cy = DOT_CENTER_Y;

  return (
    <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={color} stroke="var(--panel-bg)" strokeWidth={1.5} />
  );
};

/* ------------------------------------------------------------------ */
/*  HeadRing                                                          */
/* ------------------------------------------------------------------ */

interface HeadRingProps {
  /** 0-based column index */
  column: number;
  /** Stroke color (same as the dot fill) */
  color: string;
}

/**
 * Renders an outer ring around the commit dot to indicate HEAD is on this commit.
 */
export const HeadRing: React.FC<HeadRingProps> = ({ column, color }) => {
  const cx = colCenterX(column);
  const cy = DOT_CENTER_Y;

  return (
    <circle cx={cx} cy={cy} r={DOT_RADIUS + 3} fill="none" stroke={color} strokeWidth={2} opacity={0.8} />
  );
};
