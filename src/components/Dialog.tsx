import { useRef, useEffect, type ReactNode } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, className = "" }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  useEffect(() => {
    if (!open) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-overlay">
      <div ref={ref} className={`dialog ${className}`}>
        <div className="dialog-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
