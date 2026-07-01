import { useRef, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useClickOutside } from "../hooks/useClickOutside";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

function isReducedMotion(): boolean {
  return document.documentElement.dataset.motion === "reduced";
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

  const reduced = isReducedMotion();
  const duration = reduced ? 0 : 0.15;
  const ease: [number, number, number, number] = [0.2, 0, 0, 1];
  const springEase: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-overlay"
          style={{ pointerEvents: "auto" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration, ease }}
        >
          <motion.div
            ref={ref}
            className={`dialog ${className}`}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{
              opacity: { duration: 0.12, ease },
              scale: { duration: 0.22, ease: springEase },
              y: { duration: 0.22, ease: springEase },
            }}
          >
            <div className="dialog-title">{title}</div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
