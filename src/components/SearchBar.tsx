import { forwardRef, type ReactNode, type KeyboardEvent, type MouseEvent, type FocusEvent } from "react";
import { Search } from "lucide-react";
import "./SearchBar.css";

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional slot rendered after the input (e.g. a sort or clear button). */
  trailing?: ReactNode;
  autoFocus?: boolean;
  className?: string;
  iconSize?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  "aria-label"?: string;
}

/**
 * Standard search / filter input: a magnifier icon, a borderless text field, and
 * an optional trailing slot. Fixed height so its size never depends on the
 * trailing content. Used anywhere the app needs a search or filter box.
 */
const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  {
    value,
    onChange,
    placeholder,
    trailing,
    autoFocus,
    className = "",
    iconSize = 14,
    onKeyDown,
    onMouseDown,
    onBlur,
    "aria-label": ariaLabel,
  },
  ref
) {
  return (
    <div className={`search-bar${className ? ` ${className}` : ""}`}>
      <Search size={iconSize} className="search-bar-icon" aria-hidden="true" />
      <input
        ref={ref}
        type="text"
        className="search-bar-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onBlur={onBlur}
        aria-label={ariaLabel ?? placeholder}
      />
      {trailing}
    </div>
  );
});

export default SearchBar;
