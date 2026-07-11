import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check, X } from "lucide-react";
import "./CopyButton.css";

export interface CopyButtonProps {
  text: string;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function CopyButton({ text, label, size = "sm", disabled = false }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  }, [text, disabled]);

  const stateLabel =
    state === "copied" ? "Copied" : state === "failed" ? "Failed" : label;

  const classes = [
    "ui-copy-button",
    `ui-copy-button--${size}`,
    state !== "idle" ? `ui-copy-button--${state}` : "",
    disabled ? "ui-copy-button--disabled" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      className={classes}
      onClick={handleCopy}
      disabled={disabled}
      title={stateLabel}
      aria-label={stateLabel}
    >
      <span className="ui-copy-button__icon-wrap">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={state}
            className="ui-copy-button__icon"
            initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
          >
            {state === "idle" ? <Copy size={size === "sm" ? 14 : 16} /> :
             state === "copied" ? <Check size={size === "sm" ? 14 : 16} /> :
             <X size={size === "sm" ? 14 : 16} />}
          </motion.span>
        </AnimatePresence>
      </span>
      {label ? <span className="ui-copy-button__label">{stateLabel}</span> : null}
    </button>
  );
}
