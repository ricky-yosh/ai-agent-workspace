import { Dialog } from "./Dialog";
import { Button } from "./ui";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="dialog-confirm-text">{message}</p>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
