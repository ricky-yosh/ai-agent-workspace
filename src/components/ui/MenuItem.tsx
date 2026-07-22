import { forwardRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import "./MenuItem.css";

export interface MenuItemProps {
  active?: boolean;
  confirmed?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  label: string;
  trailing?: ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { active = false, confirmed = false, destructive = false, disabled = false, leading, label, trailing, onClick, onMouseEnter },
  ref,
) {
  const classes = [
    "ui-menu-item",
    active ? "ui-menu-item--active" : "",
    confirmed ? "ui-menu-item--confirmed" : "",
    destructive ? "ui-menu-item--destructive" : "",
  ].filter(Boolean).join(" ");

  const displayIcon = confirmed ? <Check size={15} className="ui-menu-item__leading" /> : leading;

  return (
    <button
      ref={ref}
      className={classes}
      role="listitem"
      disabled={disabled || confirmed}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="ui-menu-item__left">
        {displayIcon ?? <span className="ui-menu-item__spacer" />}
        <span className="ui-menu-item__label">{label}</span>
      </span>
      {trailing ? <span className="ui-menu-item__trailing">{trailing}</span> : null}
    </button>
  );
});
