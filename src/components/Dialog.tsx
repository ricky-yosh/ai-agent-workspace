import { useRef, useEffect, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "../hooks/useClickOutside";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  width?: number | string;
  onKeyDown?: (e: ReactKeyboardEvent) => void;
  autoFocus?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  header,
  children,
  className = "",
  overlayClassName = "",
  width,
  onKeyDown,
  autoFocus = true,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useClickOutside(ref, onClose);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
        setVisible(true);
      }));
      return () => cancelAnimationFrame(raf);
    } else if (mounted) {
      setVisible(false);
      let unmountTimer: ReturnType<typeof setTimeout>;
      let raf2: number;
      const raf = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          unmountTimer = setTimeout(() => {
            setMounted(false);
          }, 200);
        });
      });
      return () => {
        cancelAnimationFrame(raf);
        if (raf2 !== undefined) cancelAnimationFrame(raf2);
        if (unmountTimer) clearTimeout(unmountTimer);
      };
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [mounted, onClose]);

  useEffect(() => {
    if (visible && autoFocus) ref.current?.focus();
  }, [visible, autoFocus]);

  if (!mounted) return null;

  const overlayClass = `dialog-overlay${overlayClassName ? ` ${overlayClassName}` : ""}${visible ? " open" : " closing"}`;
  const dialogClass = `dialog ${className}${visible ? " open" : " closing"}`;
  const dialogStyle =
    width !== undefined
      ? { width: typeof width === "number" ? `${width}px` : width, maxWidth: typeof width === "number" ? `${width}px` : width }
      : undefined;

  return createPortal(
    <div
      className={overlayClass}
      style={{ pointerEvents: "auto" }}
      role="presentation"
    >
      <div
        ref={ref}
        className={dialogClass}
        style={dialogStyle}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {header ?? (title && <div className="dialog-title">{title}</div>)}
        {children}
      </div>
    </div>,
    document.body
  );
}
