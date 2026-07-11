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
  /** Draw the half from the top of the row to the dot line. */
  up: boolean;
  /** Draw the half from the dot line to the bottom of the row. */
  down: boolean;
  /** When true this is the commit's own dot cell — leave a gap around the dot. */
  isDot: boolean;
  /** Stroke color for the lane line(s) */
  color: string;
}

/**
 * Renders the vertical lane half-segments for a column in a row.
 *
 * Only the halves an edge actually needs are drawn, so a branch tip (no `up`)
 * or base (no `down`) renders as a clean stub instead of a full-height line
 * that over-runs the endpoint. When the commit's own dot sits in this column
 * (`isDot`) the halves stop short of the dot, leaving a gap for the circle;
 * a pass-through lane draws straight through the centre.
 */
export const Lane: React.FC<LaneProps> = ({ column, up, down, isDot, color }) => {
  if (!up && !down) return null;

  const x = colCenterX(column);
  const topEnd = isDot ? DOT_CENTER_Y - DOT_RADIUS : DOT_CENTER_Y;
  const bottomStart = isDot ? DOT_CENTER_Y + DOT_RADIUS : DOT_CENTER_Y;

  return (
    <>
      {up && (
        <line x1={x} y1={0} x2={x} y2={topEnd} stroke={color} strokeWidth={LANE_STROKE_WIDTH} opacity={LANE_OPACITY} />
      )}
      {down && (
        <line x1={x} y1={bottomStart} x2={x} y2={ROW_HEIGHT} stroke={color} strokeWidth={LANE_STROKE_WIDTH} opacity={LANE_OPACITY} />
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Connector                                                         */
/* ------------------------------------------------------------------ */

interface ConnectorProps {
  fromCol: number;
  toCol: number;
  color: string;
  kind: "merge" | "checkout";
}

export const Connector: React.FC<ConnectorProps> = ({ fromCol, toCol, color, kind }) => {
  const fromX = colCenterX(fromCol);
  const toX = colCenterX(toCol);
  const fromY = DOT_CENTER_Y;
  const toY = kind === "merge" ? ROW_HEIGHT : DOT_CENTER_Y;
  const dy = Math.abs(toY - fromY) || 8;
  const cpY = kind === "merge" ? toY - dy : fromY + dy;
  const dPath = `M ${fromX} ${fromY} C ${fromX} ${fromY + dy} ${toX} ${cpY} ${toX} ${toY}`;
  return (
    <path d={dPath} fill="none" stroke={color} strokeWidth={LANE_STROKE_WIDTH} opacity={LANE_OPACITY} strokeLinecap="round" />
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
