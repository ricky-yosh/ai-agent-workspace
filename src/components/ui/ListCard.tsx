import type { ReactNode } from "react";
import { AnimatedListRow } from "./AnimatedListRow";
import "./ListCard.css";

export interface ListCardProps {
  isFirstLoad?: boolean;
  index?: number;
  isHighlighted?: boolean;
  isFocused?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: React.MouseEventHandler;
  onFocus?: () => void;
  onBlur?: (e: React.FocusEvent) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}

export function ListCard({
  isFirstLoad,
  index,
  isHighlighted,
  isFocused = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onFocus,
  onBlur,
  cardRef,
  children,
}: ListCardProps) {
  return (
    <AnimatedListRow
      isFirstLoad={isFirstLoad}
      index={index}
      isHighlighted={isHighlighted}
    >
      <div
        ref={cardRef}
        className={"ui-list-card" + (isFocused ? " ui-list-card--focused" : "")}
        tabIndex={isFocused ? 0 : -1}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {children}
      </div>
    </AnimatedListRow>
  );
}
