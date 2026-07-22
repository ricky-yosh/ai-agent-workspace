import { type CSSProperties, type ReactNode } from "react";
import "./Badge.css";

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
  style?: CSSProperties;
  children: ReactNode;
}

export function Badge({ variant = "default", size = "md", style, children }: BadgeProps) {
  const classes = [
    "ui-badge",
    `ui-badge--${variant}`,
    `ui-badge--${size}`,
  ].join(" ");

  return <span className={classes} style={style}>{children}</span>;
}
