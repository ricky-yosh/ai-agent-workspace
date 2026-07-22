import { motion, type HTMLMotionProps } from "motion/react";

const highlightBg = "rgba(77, 142, 240, 0.18)";
const highlightBorder = "rgba(77, 142, 240, 0.25)";

export interface AnimatedListRowProps extends HTMLMotionProps<"div"> {
  isFirstLoad?: boolean;
  index?: number;
  isHighlighted?: boolean;
}

export function AnimatedListRow({
  isFirstLoad = false,
  index = 0,
  isHighlighted = false,
  layout = true,
  initial,
  animate,
  exit: exitProp,
  transition,
  ...rest
}: AnimatedListRowProps) {
  return (
    <motion.div
      layout={layout}
      initial={initial ?? (isFirstLoad ? { opacity: 0, y: 8 } : false)}
      animate={{
        opacity: 1,
        y: 0,
        backgroundColor: isHighlighted ? highlightBg : undefined,
        borderColor: isHighlighted ? highlightBorder : undefined,
        ...(animate as Record<string, unknown>),
      }}
      exit={exitProp ?? { opacity: 0, scale: 0.95 }}
      transition={transition ?? {
        duration: isFirstLoad ? 0.2 : 0.15,
        delay: isFirstLoad ? index * 0.03 : 0,
        ease: [0.2, 0, 0, 1],
        layout: { duration: 0.2 },
      }}
      {...rest}
    />
  );
}
