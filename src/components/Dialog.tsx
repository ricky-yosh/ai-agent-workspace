import { useRef, useEffect, useState, type ReactNode } from "react";
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
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useClickOutside(ref, onClose);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    } else if (mounted) {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [mounted, onClose]);

  if (!mounted) return null;

  const overlayClass = `dialog-overlay${visible ? " open" : " closing"}`;
  const dialogClass = `dialog ${className}${visible ? " open" : " closing"}`;

  return (
    <div className={overlayClass}>
      <div ref={ref} className={dialogClass}>
        <div className="dialog-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
