import { forwardRef, type ReactNode, type ElementType } from "react";
import "./Text.css";

export interface TextProps {
  size?: "xs" | "sm" | "base" | "lg" | "xl" | "2xl";
  weight?: "normal" | "medium" | "semibold" | "bold";
  color?: "primary" | "secondary" | "muted" | "dim";
  leading?: "tight" | "normal" | "relaxed";
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  { size = "base", weight = "normal", color = "primary", leading = "normal", as: Component = "span", className, children },
  ref,
) {
  const classes = [
    "ui-text",
    `ui-text--size-${size}`,
    `ui-text--weight-${weight}`,
    `ui-text--color-${color}`,
    `ui-text--leading-${leading}`,
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <Component ref={ref} className={classes}>
      {children}
    </Component>
  );
});
