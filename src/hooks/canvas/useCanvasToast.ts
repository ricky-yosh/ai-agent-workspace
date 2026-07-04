import { useState, useCallback, useRef } from "react";

export function useCanvasToast(): {
  toast: string | null;
  showToast: (message: string) => void;
} {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 1500);
  }, []);

  return { toast, showToast };
}
