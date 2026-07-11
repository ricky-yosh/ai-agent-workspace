import { type ReactNode } from "react";
import "./Badge.css";

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
  children: ReactNode;
}

export function Badge({ variant = "default", size = "md", children }: BadgeProps) {
  const classes = [
    "ui-badge",
    `ui-badge--${variant}`,
    `ui-badge--${size}`,
  ].join(" ");

  return <span className={classes}>{children}</span>;
}
