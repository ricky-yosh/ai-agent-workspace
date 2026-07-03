import { useRef, useEffect, useState, useCallback } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import "../ContextMenu.css";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useClickOutside(menuRef, onClose);

  // Determine which items are navigable (non-separator, non-disabled)
  const navigableIndices = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !item.separator && !item.disabled)
    .map(({ idx }) => idx);

  // Find the first navigable index for initial focus
  useEffect(() => {
    if (navigableIndices.length > 0) {
      setFocusedIndex(navigableIndices[0]);
    }
  }, [navigableIndices.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Viewport edge detection: adjust position to stay on-screen
  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const menuWidth = rect.width || 180;
    const menuHeight = rect.height || 0;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const padding = 8;

    let newX = x;
    let newY = y;

    // Flip horizontally if overflowing right edge
    if (x + menuWidth > viewportW - padding) {
      newX = x - menuWidth;
    }
    // Flip vertically if overflowing bottom edge
    if (y + menuHeight > viewportH - padding) {
      newY = y - menuHeight;
    }
    // Clamp to left/top edge
    if (newX < padding) newX = padding;
    if (newY < padding) newY = padding;

    setAdjustedPos({ x: newX, y: newY });
  }, [x, y]);

  // Mount/unmount animation lifecycle
  useEffect(() => {
    setMounted(true);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setVisible(true))
    );
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  // Close handler with exit animation
  const handleClose = useCallback(() => {
    setVisible(false);
    const timer = setTimeout(() => onClose(), 150);
    return () => clearTimeout(timer);
  }, [onClose]);

  // Escape key handler
  useEffect(() => {
    if (!mounted) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [mounted, handleClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (navigableIndices.length === 0) return;

      const currentPos = navigableIndices.indexOf(focusedIndex);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next =
            currentPos < navigableIndices.length - 1
              ? navigableIndices[currentPos + 1]
              : navigableIndices[0];
          setFocusedIndex(next);
          itemRefs.current[next]?.focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev =
            currentPos > 0
              ? navigableIndices[currentPos - 1]
              : navigableIndices[navigableIndices.length - 1];
          setFocusedIndex(prev);
          itemRefs.current[prev]?.focus();
          break;
        }
        case "Enter": {
          e.preventDefault();
          const item = items[focusedIndex];
          if (item && !item.disabled && !item.separator) {
            item.onClick();
            handleClose();
          }
          break;
        }
        case "Tab": {
          // Trap focus within menu
          e.preventDefault();
          if (e.shiftKey) {
            const prev =
              currentPos > 0
                ? navigableIndices[currentPos - 1]
                : navigableIndices[navigableIndices.length - 1];
            setFocusedIndex(prev);
            itemRefs.current[prev]?.focus();
          } else {
            const next =
              currentPos < navigableIndices.length - 1
                ? navigableIndices[currentPos + 1]
                : navigableIndices[0];
            setFocusedIndex(next);
            itemRefs.current[next]?.focus();
          }
          break;
        }
      }
    },
    [focusedIndex, navigableIndices, items, handleClose]
  );

  // Focus first navigable item when menu opens
  useEffect(() => {
    if (visible && navigableIndices.length > 0) {
      const first = navigableIndices[0];
      itemRefs.current[first]?.focus();
    }
  }, [visible, navigableIndices]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  const menuClass = `context-menu context-menu--canvas${visible ? " open" : ""}`;

  return (
    <div
      ref={menuRef}
      className={menuClass}
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      role="menu"
      aria-label="Context menu"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return <div key={`sep-${idx}`} className="context-menu-divider" role="separator" />;
        }

        const isFocused = focusedIndex === idx;

        return (
          <div
            key={`${item.label}-${idx}`}
            ref={(el) => { itemRefs.current[idx] = el; }}
            className={`context-menu-item${item.disabled ? " context-menu-item-disabled" : ""}${isFocused ? " focused" : ""}`}
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.disabled || undefined}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              handleClose();
            }}
            onMouseEnter={() => {
              if (!item.disabled) {
                setFocusedIndex(idx);
              }
            }}
          >
            {item.icon && <span className="context-menu-item-icon">{item.icon}</span>}
            <span className="context-menu-item-label">{item.label}</span>
            {item.shortcut && (
              <span className="context-menu-item-shortcut">{item.shortcut}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
