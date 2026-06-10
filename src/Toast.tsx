import { useEffect } from "react";
import type { Toast } from "./ToastContext";
import { useToast } from "./ToastContext";
import "./Toast.css";

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export function ToastItem({ toast, onDismiss }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`toast toast--${toast.type}`}>
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={() => onDismiss(toast.id)}>
        ×
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}
