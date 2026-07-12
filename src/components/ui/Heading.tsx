import { forwardRef, type ReactNode } from "react";
import "./Heading.css";

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
type HeadingColor = "primary" | "secondary" | "muted" | "dim";
type HeadingWeight = "normal" | "medium" | "semibold" | "bold";

export interface HeadingProps {
  level?: HeadingLevel;
  color?: HeadingColor;
  weight?: HeadingWeight;
  className?: string;
  children: ReactNode;
}

const TAGS: Record<HeadingLevel, "h1" | "h2" | "h3" | "h4" | "h5" | "h6"> = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
};

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { level = 1, color = "primary", weight, className, children },
  ref,
) {
  const Tag = TAGS[level];
  const classes = [
    "ui-heading",
    `ui-heading--${level}`,
    `ui-heading--color-${color}`,
    weight ? `ui-heading--weight-${weight}` : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <Tag ref={ref} className={classes}>
      {children}
    </Tag>
  );
});
