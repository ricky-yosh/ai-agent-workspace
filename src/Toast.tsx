import { useEffect, useState } from "react";
import type { Toast } from "./ToastContext";
import { useToast } from "./ToastContext";
import { Button } from "./components/ui";
import "./Toast.css";

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
  index: number;
}

export function ToastItem({ toast, onDismiss, index }: ToastItemProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (toast.exiting) return;
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss, toast.exiting]);

  const classes = `toast toast--${toast.type}${entered && !toast.exiting ? " toast--entered" : ""}${toast.exiting ? " toast--exiting" : ""}`;

  return (
    <div
      className={classes}
      style={{ "--stagger-delay": toast.exiting ? "0ms" : `${index * 80}ms` } as React.CSSProperties}
    >
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => onDismiss(toast.id)}>
        ×
      </Button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container">
      {toasts.map((toast, index) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} index={index} />
      ))}
    </div>
  );
}
